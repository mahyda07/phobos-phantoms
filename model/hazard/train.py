# Written with AI assistance (Claude). Track: AI and safety model (Maryam, [P1]).
"""Train HazardNet on the HiRISE photo band with DTM-derived hazard classes.

  uv run python model/hazard/train.py              # full run (settings in config.json 'train')
  uv run python model/hazard/train.py --resume     # continue after a stop or power cut (from last.pt)
  uv run python model/hazard/train.py --smoke      # 2 tiny epochs to check that everything runs

Saves into <data_dir>/ai/runs/<run_name>/: last.pt (every epoch, resumable), best.pt (best validation mIoU),
log.csv (one row per epoch), train_info.json. The walking area block is never sampled (role 'walk' in split.json).
Seeds are fixed (config 'seed'); GPU arithmetic still leaves small run-to-run differences.
"""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))   # lets the scripts import each other when run by path
import argparse, csv, json, math, sys, time

import numpy as np
import torch
import torch.nn.functional as F

from common import AI, CFG, sha256
from net import HazardNet, to_input


def log(msg): print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def confusion(pred, target, n, ignore):
    m = target != ignore
    return torch.bincount(target[m].long() * n + pred[m].long(), minlength=n * n).reshape(n, n)


def iou_from_cm(cm):
    cm = cm.double()
    tp = cm.diag()
    den = cm.sum(0) + cm.sum(1) - tp
    iou = torch.where(den > 0, tp / den.clamp(min=1), torch.full_like(tp, float("nan")))
    return iou.tolist(), float(tp.sum() / cm.sum().clamp(min=1))


def load_data():
    band = np.load(AI / "ortho_band.npy")                   # whole band in memory (2.6 GB, uint8)
    labels = np.load(AI / "labels_2m.npy")
    split = json.loads((AI / "split.json").read_text())
    return band, labels, split


class TrainSampler:
    """Random tiles inside the training blocks. Half of them are placed on a random 'careful' or 'avoid' cell."""
    def __init__(self, labels, split, tile_cells, focus_share):
        self.labels, self.t, self.focus = labels, tile_cells, focus_share
        self.nb = split["block_cells"]
        self.blocks = [(b["i0"], b["j0"]) for b in split["blocks"] if b["role"] == "train"]
        self.hot = []
        for i0, j0 in self.blocks:
            c = labels[i0:i0 + self.nb, j0:j0 + self.nb]
            ii, jj = np.nonzero((c == 1) | (c == 2))
            self.hot.append(np.stack([ii, jj], 1).astype(np.int32))

    def sample(self, rng):
        k = int(rng.integers(len(self.blocks)))
        i0, j0 = self.blocks[k]
        hi = self.nb - self.t
        if rng.random() < self.focus and len(self.hot[k]):
            ci, cj = self.hot[k][int(rng.integers(len(self.hot[k])))]
            a = int(np.clip(ci - rng.integers(self.t), 0, hi)); b = int(np.clip(cj - rng.integers(self.t), 0, hi))
        else:
            a, b = int(rng.integers(hi + 1)), int(rng.integers(hi + 1))
        return i0 + a, j0 + b


def get_batch(band, labels, cells, t, device):
    img = np.stack([band[i * 8:(i + t) * 8, j * 8:(j + t) * 8] for i, j in cells])
    lab = np.stack([labels[i:i + t, j:j + t] for i, j in cells])
    return torch.from_numpy(img).to(device, non_blocking=True), torch.from_numpy(lab).to(device, non_blocking=True)


@torch.no_grad()
def evaluate_tiles(model, band, labels, tiles, t, device, n_classes, ignore, batch=32, weight=None):
    model.eval()
    cm = torch.zeros(n_classes, n_classes, dtype=torch.long, device=device)
    loss_sum, n = 0.0, 0
    for a in range(0, len(tiles), batch):
        img, lab = get_batch(band, labels, tiles[a:a + batch], t, device)
        with torch.autocast("cuda", enabled=device.type == "cuda"):
            out = model(to_input(img).contiguous(memory_format=torch.channels_last))
        loss_sum += float(F.cross_entropy(out.float(), lab.long(), weight=weight, ignore_index=ignore)) * len(img); n += len(img)
        cm += confusion(out.argmax(1), lab, n_classes, ignore)
    return cm.cpu(), loss_sum / max(1, n)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--resume", action="store_true"); ap.add_argument("--smoke", action="store_true")
    args = ap.parse_args()
    T, L, seed = dict(CFG["train"]), CFG["labels"], CFG["seed"]
    if args.smoke:
        T.update(epochs=2, steps_per_epoch=20, run_name=T["run_name"] + "-smoke")
    run = AI / "runs" / T["run_name"]; run.mkdir(parents=True, exist_ok=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    n_classes, ignore = len(L["classes"]), L["ignore_index"]
    torch.manual_seed(seed); np.random.seed(seed)
    torch.backends.cudnn.benchmark = True
    log(f"device {device} ({torch.cuda.get_device_name(0) if device.type == 'cuda' else 'cpu'}), torch {torch.__version__}")
    band, labels, split = load_data()
    t = T["tile_px"] // 8
    assert t == split["tile_cells"], "tile size differs from split.json"
    sampler = TrainSampler(labels, split, t, T["focus_share"])
    val_tiles = [tuple(x) for b in split["blocks"] if b["role"] == "val" for x in b["tiles"]]
    if args.smoke:
        val_tiles = val_tiles[:64]
    counts = np.array([split["summary"]["train"]["cells_per_class"][c] for c in L["classes"]], float)
    w = (counts.sum() / counts) ** T["class_weight_power"]; w = w / w.mean()
    weight = torch.tensor(w, dtype=torch.float32, device=device)
    log(f"train blocks {len(sampler.blocks)}, validation tiles {len(val_tiles)}, class weights {np.round(w, 3).tolist()}")
    model = HazardNet(n_classes).to(device).to(memory_format=torch.channels_last)
    n_params = sum(p.numel() for p in model.parameters())
    opt = torch.optim.AdamW(model.parameters(), lr=T["lr"], weight_decay=T["weight_decay"])
    scaler = torch.amp.GradScaler("cuda", enabled=device.type == "cuda")
    start, best, bad = 0, -1.0, 0
    log_path = run / "log.csv"
    if args.resume and (run / "last.pt").exists():
        ck = torch.load(run / "last.pt", map_location=device, weights_only=False)
        model.load_state_dict(ck["model"]); opt.load_state_dict(ck["opt"]); scaler.load_state_dict(ck["scaler"])
        start, best, bad = ck["epoch"] + 1, ck["best"], ck["bad"]
        log(f"resumed after epoch {ck['epoch']} (best validation mIoU so far {best:.4f})")
    else:
        with open(log_path, "w", newline="") as fh:
            csv.writer(fh).writerow(["epoch", "lr", "train_loss", "val_loss", "val_miou", "val_pixel_acc"]
                                    + [f"val_iou_{c}" for c in L["classes"]] + ["seconds"])
    steps = T["steps_per_epoch"]
    epochs_run = start
    for epoch in range(start, T["epochs"]):
        if bad >= T["patience"]:
            log(f"early stop: no better validation mIoU for {bad} epochs"); break
        t0 = time.time(); epochs_run = epoch + 1
        rng = np.random.default_rng([seed, epoch])
        g = torch.Generator(device="cpu").manual_seed(seed * 1000 + epoch)
        model.train(); loss_sum = 0.0
        for step in range(steps):
            frac = (epoch + step / steps)
            lr = T["lr"] * (frac / T["warmup_epochs"] if frac < T["warmup_epochs"]
                            else 0.5 * (1 + math.cos(math.pi * (frac - T["warmup_epochs"]) / max(1e-9, T["epochs"] - T["warmup_epochs"]))))
            for pg in opt.param_groups: pg["lr"] = lr
            cells = [sampler.sample(rng) for _ in range(T["batch"])]
            img, lab = get_batch(band, labels, cells, t, device)
            x = to_input(img)
            con = 1 + T["contrast"] * (2 * torch.rand(len(x), 1, 1, 1, generator=g).to(device) - 1)
            bri = T["brightness"] / 0.25 * (2 * torch.rand(len(x), 1, 1, 1, generator=g).to(device) - 1)
            x = (x * con + bri).contiguous(memory_format=torch.channels_last)
            with torch.autocast("cuda", enabled=device.type == "cuda"):
                out = model(x)
            loss = F.cross_entropy(out.float(), lab.long(), weight=weight, ignore_index=ignore)
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward(); scaler.step(opt); scaler.update()
            loss_sum += loss.detach().item()
        cm, val_loss = evaluate_tiles(model, band, labels, val_tiles, t, device, n_classes, ignore, weight=weight)
        ious, acc = iou_from_cm(cm)
        miou = float(np.nanmean(ious))
        improved = miou > best
        if improved: best, bad = miou, 0
        else: bad += 1
        ck = {"model": model.state_dict(), "opt": opt.state_dict(), "scaler": scaler.state_dict(), "epoch": epoch, "best": best,
              "bad": bad, "config": CFG, "classes": L["classes"], "val_miou": miou}
        torch.save(ck, run / "last.tmp"); (run / "last.tmp").replace(run / "last.pt")
        if improved:
            torch.save({k: ck[k] for k in ("model", "epoch", "config", "classes", "val_miou")}, run / "best.tmp")
            (run / "best.tmp").replace(run / "best.pt")
        with open(log_path, "a", newline="") as fh:
            csv.writer(fh).writerow([epoch, f"{lr:.6f}", f"{loss_sum / steps:.4f}", f"{val_loss:.4f}", f"{miou:.4f}", f"{acc:.4f}"]
                                    + [f"{v:.4f}" for v in ious] + [f"{time.time() - t0:.1f}"])
        log(f"epoch {epoch:3d} | train loss {loss_sum / steps:.4f} | val loss {val_loss:.4f} | val mIoU {miou:.4f} "
            f"({', '.join(f'{c} {v:.3f}' for c, v in zip(L['classes'], ious))}) | {time.time() - t0:.0f} s{' | best' if improved else ''}")
    info = {"run": T["run_name"], "parameters": n_params, "best_val_miou": best, "epochs_run": epochs_run, "settings": T, "seed": seed,
            "torch": torch.__version__, "device": torch.cuda.get_device_name(0) if device.type == "cuda" else "cpu",
            "best_checkpoint": str(run / "best.pt"), "sha256_best": sha256(run / "best.pt"),
            "finished": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    (run / "train_info.json").write_text(json.dumps(info, indent=1))
    log("DONE " + json.dumps(info))


if __name__ == "__main__":
    main()
