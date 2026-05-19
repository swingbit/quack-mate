Precomputed tables initialized.
Starting Benchmark at Depth 5 with 1 Threads (Batch Size: 32)...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | d2d4 | 110 | 5071234 | 185414 | 50402.5 |
| ID (Exhaustive) | d2d4 | 110 | 5287598 | 69729 | 49339.0 |
| BPVS (ID + AB + LMP + Batches) | d2d4 | 110 | 1160683 | 22594 | 12579.0 |
| + MVVLVA | d2d4 | 110 | 1160683 | 22107 | 5557.2 |
| + TT | d2d4 | 110 | 1149426 | 22249 | 5549.0 |
| + PST | d2d4 | 110 | 752765 | 14220 | 5546.5 |
| + Killers | d2d4 | 110 | 752778 | 14171 | 4032.5 |
| + History | d2d4 | 110 | 752775 | 14547 | 4015.4 |
| + RFP | e2e4 | 110 | 713007 | 14953 | 3996.1 |
| + FFP | d2d4 | 110 | 234464 | 7642 | 3996.1 |
| + LMR | d2d4 | 110 | 234176 | 7375 | 2288.8 |
| Standard (DFS Reference) | b1c3 | 110 | 3801 | 206 | 2295.4 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | c3d5 | 410 | 4150670 | 95467 | 17301.9 |
| + MVVLVA | c3d5 | 375 | 1821127 | 42921 | 17236.6 |
| + TT | c3d5 | 335 | 1851211 | 44936 | 7958.8 |
| + PST | c3d5 | 410 | 1760072 | 41467 | 7958.8 |
| + Killers | c3d5 | 410 | 1761686 | 41164 | 7516.5 |
| + History | c3d5 | 410 | 1761464 | 42132 | 7516.5 |
| + RFP | c3d5 | 410 | 222912 | 9380 | 7492.0 |
| + FFP | c3d5 | 330 | 3868908 | 88320 | 19018.4 |
| + LMR | c3d5 | 330 | 2567270 | 64680 | 18921.8 |
| Standard (DFS Reference) | c3d5 | 410 | 4829 | 238 | 12674.7 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 445 | 9837299 | 242261 | 24756.7 |
| + MVVLVA | e2a6 | 445 | 7746782 | 188838 | 23730.5 |
| + TT | e2a6 | 445 | 7708589 | 192599 | 23118.7 |
| + PST | e2a6 | 445 | 7145929 | 161925 | 23124.1 |
| + Killers | e2a6 | 445 | 7135279 | 164280 | 22746.4 |
| + History | e2a6 | 445 | 7135437 | 164859 | 22887.2 |
| + RFP | e2a6 | 170 | 499486 | 16352 | 22695.3 |
| + FFP | e2a6 | 170 | 425604 | 15455 | 3700.2 |
| + LMR | e2a6 | 170 | 360403 | 13494 | 3573.1 |
| Standard (DFS Reference) | e2a6 | 375 | 7322 | 373 | 2986.1 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 110 | 716960 | 25308 | 8830.4 |
| ID (Exhaustive) | b4f4 | 110 | 766295 | 13005 | 7130.8 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 110 | 304222 | 7373 | 3501.3 |
| + MVVLVA | b4f4 | 110 | 316219 | 7581 | 1795.1 |
| + TT | b4f4 | 110 | 324211 | 7793 | 1824.7 |
| + PST | b4f4 | 110 | 228759 | 6475 | 1824.7 |
| + Killers | b4f4 | 110 | 235667 | 6327 | 1486.4 |
| + History | b4f4 | 110 | 235672 | 6468 | 1487.6 |
| + RFP | b4f4 | 110 | 178187 | 5524 | 1487.6 |
| + FFP | b4f4 | 110 | 159614 | 5369 | 1266.7 |
| + LMR | b4f4 | 110 | 82960 | 4174 | 1266.7 |
| Standard (DFS Reference) | b4f4 | 110 | 2827 | 70 | 916.6 |


Benchmark Complete.
