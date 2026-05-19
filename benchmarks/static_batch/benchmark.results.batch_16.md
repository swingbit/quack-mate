Precomputed tables initialized.
Starting Benchmark at Depth 5 with 1 Threads (Batch Size: 16)...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | d2d4 | 110 | 5071234 | 186429 | 50294.5 |
| ID (Exhaustive) | d2d4 | 110 | 5287598 | 69372 | 49434.2 |
| BPVS (ID + AB + LMP + Batches) | d2d4 | 110 | 1160683 | 22652 | 12555.3 |
| + MVVLVA | d2d4 | 110 | 1160683 | 22224 | 5535.7 |
| + TT | d2d4 | 110 | 1149426 | 22587 | 5509.9 |
| + PST | d2d4 | 110 | 752765 | 14444 | 5507.4 |
| + Killers | d2d4 | 110 | 752778 | 14297 | 4025.7 |
| + History | d2d4 | 110 | 752775 | 14219 | 4033.2 |
| + RFP | e2e4 | 110 | 713007 | 14437 | 4033.2 |
| + FFP | d2d4 | 110 | 234464 | 7531 | 3994.4 |
| + LMR | d2d4 | 110 | 234176 | 7099 | 2289.9 |
| Standard (DFS Reference) | b1c3 | 110 | 3801 | 196 | 2276.2 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | c3d5 | 410 | 3463939 | 81053 | 14319.9 |
| + MVVLVA | c3d5 | 375 | 1821127 | 43327 | 14272.1 |
| + TT | c3d5 | 335 | 1851211 | 45376 | 7960.3 |
| + PST | c3d5 | 410 | 1760359 | 42167 | 7960.3 |
| + Killers | c3d5 | 410 | 1761559 | 41852 | 7525.3 |
| + History | c3d5 | 410 | 1761575 | 42857 | 7583.9 |
| + RFP | c3d5 | 410 | 222880 | 9847 | 7529.8 |
| + FFP | c3d5 | 330 | 3868767 | 89604 | 18576.2 |
| + LMR | c3d5 | 330 | 2567127 | 65699 | 18472.0 |
| Standard (DFS Reference) | c3d5 | 410 | 4829 | 233 | 12599.3 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 445 | 9880076 | 246264 | 23527.2 |
| + MVVLVA | e2a6 | 445 | 7707130 | 187786 | 23178.0 |
| + TT | e2a6 | 445 | 7711286 | 194102 | 23246.8 |
| + PST | e2a6 | 445 | 7145929 | 161390 | 23080.0 |
| + Killers | e2a6 | 445 | 7135279 | 166192 | 22719.4 |
| + History | e2a6 | 445 | 7135437 | 164145 | 23052.6 |
| + RFP | e2a6 | 170 | 499486 | 16508 | 22860.6 |
| + FFP | e2a6 | 170 | 425604 | 15433 | 3710.6 |
| + LMR | e2a6 | 170 | 360403 | 13410 | 3589.4 |
| Standard (DFS Reference) | e2a6 | 375 | 7322 | 352 | 2997.1 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 110 | 716960 | 25139 | 8836.9 |
| ID (Exhaustive) | b4f4 | 110 | 766295 | 13084 | 7128.9 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 110 | 304222 | 7148 | 3509.1 |
| + MVVLVA | b4f4 | 110 | 316219 | 7722 | 1795.1 |
| + TT | b4f4 | 110 | 324211 | 7737 | 1836.4 |
| + PST | b4f4 | 110 | 228759 | 6424 | 1836.4 |
| + Killers | b4f4 | 110 | 235667 | 6387 | 1493.8 |
| + History | b4f4 | 110 | 235672 | 6324 | 1509.1 |
| + RFP | b4f4 | 110 | 178187 | 5654 | 1509.1 |
| + FFP | b4f4 | 110 | 159614 | 5646 | 1272.9 |
| + LMR | b4f4 | 110 | 82960 | 4210 | 1249.9 |
| Standard (DFS Reference) | b4f4 | 110 | 2827 | 72 | 925.2 |


Benchmark Complete.
