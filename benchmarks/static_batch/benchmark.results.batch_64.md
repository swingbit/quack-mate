Precomputed tables initialized.
Starting Benchmark at Depth 5 with 1 Threads (Batch Size: 64)...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | d2d4 | 110 | 5071234 | 185241 | 50419.7 |
| ID (Exhaustive) | d2d4 | 110 | 5287598 | 69423 | 49309.7 |
| BPVS (ID + AB + LMP + Batches) | d2d4 | 110 | 1160683 | 22717 | 12551.0 |
| + MVVLVA | d2d4 | 110 | 1160683 | 22176 | 5524.3 |
| + TT | d2d4 | 110 | 1149426 | 22334 | 5493.6 |
| + PST | d2d4 | 110 | 752765 | 14418 | 5491.0 |
| + Killers | d2d4 | 110 | 752778 | 14412 | 3994.4 |
| + History | d2d4 | 110 | 752775 | 14289 | 4010.5 |
| + RFP | e2e4 | 110 | 713007 | 14967 | 4003.8 |
| + FFP | d2d4 | 110 | 234464 | 7487 | 3975.4 |
| + LMR | d2d4 | 110 | 234176 | 7061 | 2273.6 |
| Standard (DFS Reference) | b1c3 | 110 | 3801 | 194 | 2284.1 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | c3d5 | 410 | 4670194 | 104584 | 19537.5 |
| + MVVLVA | c3d5 | 375 | 1821127 | 42440 | 19438.6 |
| + TT | c3d5 | 335 | 1851211 | 43736 | 7918.6 |
| + PST | c3d5 | 410 | 1760072 | 40945 | 7917.2 |
| + Killers | c3d5 | 410 | 1761686 | 40892 | 7532.0 |
| + History | c3d5 | 410 | 1761464 | 41793 | 7593.3 |
| + RFP | c3d5 | 410 | 222912 | 8887 | 7593.3 |
| + FFP | c3d5 | 330 | 3868908 | 86668 | 18487.2 |
| + LMR | c3d5 | 330 | 2567270 | 63994 | 18423.2 |
| Standard (DFS Reference) | c3d5 | 410 | 4829 | 217 | 9962.0 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 445 | 9866322 | 238759 | 25014.7 |
| + MVVLVA | e2a6 | 445 | 7743832 | 183769 | 24994.6 |
| + TT | e2a6 | 445 | 7714599 | 189642 | 23533.0 |
| + PST | e2a6 | 445 | 7145929 | 160818 | 22926.4 |
| + Killers | e2a6 | 445 | 7135279 | 164179 | 22744.0 |
| + History | e2a6 | 445 | 7135437 | 163839 | 22735.8 |
| + RFP | e2a6 | 170 | 499486 | 16277 | 22543.9 |
| + FFP | e2a6 | 170 | 425604 | 14952 | 3678.3 |
| + LMR | e2a6 | 170 | 360403 | 13500 | 3533.7 |
| Standard (DFS Reference) | e2a6 | 375 | 7322 | 363 | 2962.7 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 110 | 716960 | 25549 | 8820.5 |
| ID (Exhaustive) | b4f4 | 110 | 766295 | 12784 | 7109.0 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 110 | 304222 | 7367 | 3497.5 |
| + MVVLVA | b4f4 | 110 | 316219 | 7656 | 1765.9 |
| + TT | b4f4 | 110 | 324211 | 7787 | 1812.5 |
| + PST | b4f4 | 110 | 228759 | 6580 | 1812.5 |
| + Killers | b4f4 | 110 | 235667 | 6265 | 1467.8 |
| + History | b4f4 | 110 | 235672 | 6365 | 1467.8 |
| + RFP | b4f4 | 110 | 178187 | 5563 | 1462.0 |
| + FFP | b4f4 | 110 | 159614 | 5491 | 1247.4 |
| + LMR | b4f4 | 110 | 82960 | 4032 | 1223.1 |
| Standard (DFS Reference) | b4f4 | 110 | 2827 | 74 | 889.0 |


Benchmark Complete.
