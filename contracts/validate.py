# Written with AI assistance (Claude).
"""Validate every example and fixture against the contracts. CI runs this on every PR.
Usage: python contracts/validate.py [extra files as schema_name=path ...]"""
import json, sys, pathlib
from jsonschema import Draft202012Validator
here = pathlib.Path(__file__).parent
ok = True
pairs = [(p.name.replace(".schema.json", ""), here / "examples" / (p.name.replace(".schema.json", ".example.json"))) for p in here.glob("*.schema.json")]
pairs += [tuple(a.split("=", 1)) for a in sys.argv[1:]]
for name, path in pairs:
    schema = json.loads((here / f"{name}.schema.json").read_text())
    data = json.loads(pathlib.Path(path).read_text())
    errs = sorted(Draft202012Validator(schema).iter_errors(data), key=lambda e: list(e.path))
    for e in errs: print(f"FAIL {name} {path}: {'/'.join(map(str, e.path))}: {e.message}")
    ok &= not errs
    if not errs: print(f"ok   {name} {path}")
sys.exit(0 if ok else 1)
