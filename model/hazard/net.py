# Written with AI assistance (Claude). Track: AI and safety model (Maryam, [P1]).
"""HazardNet: a small U-Net-style network, trained from scratch (no pre-trained weights, so no weight licence).

Input : one-channel HiRISE photo tile at 25 cm per pixel, shape (B, 1, H, W), H and W multiples of 32.
Output: class scores for every 2 m cell (8 x 8 pixels), shape (B, n_classes, H/8, W/8).
"""
import torch
import torch.nn as nn
import torch.nn.functional as F


def block(cin, cout):
    return nn.Sequential(nn.Conv2d(cin, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
                         nn.Conv2d(cout, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True))


class HazardNet(nn.Module):
    def __init__(self, n_classes=3, width=32):
        super().__init__()
        w = width
        self.stem = nn.Sequential(nn.Conv2d(1, w, 3, stride=2, padding=1, bias=False), nn.BatchNorm2d(w), nn.ReLU(inplace=True))
        self.e1 = block(w, w)               # 1/2
        self.e2 = block(w, 2 * w)           # 1/4
        self.e3 = block(2 * w, 4 * w)       # 1/8
        self.e4 = block(4 * w, 8 * w)       # 1/16
        self.e5 = block(8 * w, 8 * w)       # 1/32
        self.d4 = block(16 * w, 8 * w)      # 1/16
        self.d3 = block(12 * w, 4 * w)      # 1/8
        self.head = nn.Conv2d(4 * w, n_classes, 1)

    def forward(self, x):
        x1 = self.e1(self.stem(x))
        x2 = self.e2(F.max_pool2d(x1, 2))
        x3 = self.e3(F.max_pool2d(x2, 2))
        x4 = self.e4(F.max_pool2d(x3, 2))
        x5 = self.e5(F.max_pool2d(x4, 2))
        y4 = self.d4(torch.cat([F.interpolate(x5, size=x4.shape[-2:], mode="bilinear", align_corners=False), x4], 1))
        y3 = self.d3(torch.cat([F.interpolate(y4, size=x3.shape[-2:], mode="bilinear", align_corners=False), x3], 1))
        return self.head(y3)


def to_input(u8):
    """uint8 photo tensor (B, H, W) on any device -> float input (B, 1, H, W)."""
    return ((u8.float() / 255.0) - 0.5).div(0.25).unsqueeze(1)
