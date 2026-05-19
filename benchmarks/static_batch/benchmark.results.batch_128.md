Precomputed tables initialized.
Starting Benchmark at Depth 5 with 1 Threads (Batch Size: 128)...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | d2d4 | 110 | 5071234 | 186078 | 50533.2 |
| ID (Exhaustive) | d2d4 | 110 | 5287598 | 69069 | 49531.6 |
| BPVS (ID + AB + LMP + Batches) | d2d4 | 110 | 1160683 | 22462 | 12576.6 |
| + MVVLVA | d2d4 | 110 | 1160683 | 21792 | 5523.9 |
| + TT | d2d4 | 110 | 1149426 | 22259 | 5504.5 |
| + PST | d2d4 | 110 | 752765 | 14444 | 5502.1 |
| + Killers | d2d4 | 110 | 752778 | 14456 | 4006.1 |
| + History | d2d4 | 110 | 752775 | 14535 | 4029.3 |
| + RFP | e2e4 | 110 | 713007 | 14696 | 4018.9 |
| + FFP | d2d4 | 110 | 234464 | 7521 | 3991.9 |
| + LMR | d2d4 | 110 | 234176 | 7288 | 2275.0 |
| Standard (DFS Reference) | b1c3 | 110 | 3801 | 210 | 2276.6 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | c3d5 | 410 | 4670194 | 104787 | 19582.5 |
| + MVVLVA | c3d5 | 375 | 1821127 | 42671 | 19561.6 |
| + TT | c3d5 | 335 | 1851211 | 44135 | 7932.5 |
| + PST | c3d5 | 410 | 1760072 | 40899 | 7931.1 |
| + Killers | c3d5 | 410 | 1761686 | 40563 | 7492.4 |
| + History | c3d5 | 410 | 1761464 | 40936 | 7574.8 |
| + RFP | c3d5 | 410 | 222912 | 9024 | 7574.8 |
| + FFP | c3d5 | 330 | 3868908 | 87028 | 18443.0 |
| + LMR | c3d5 | 330 | 2567270 | 64538 | 18379.2 |
| Standard (DFS Reference) | c3d5 | 410 | 4829 | 218 | 12608.3 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 445 | 9866322 | 239332 | 24316.7 |
| + MVVLVA | e2a6 | 445 | 7743832 | 184814 | 24316.7 |
| + TT | e2a6 | 445 | 7714599 | 189819 | 23898.6 |
| + PST | e2a6 | 445 | 7145929 | 160141 | 23706.9 |
| + Killers | e2a6 | 445 | 7135279 | 162772 | 22721.2 |
| + History | e2a6 | 445 | 7135437 | 164235 | 22907.2 |
| + RFP | e2a6 | 170 | 499486 | 16312 | 22715.2 |
| + FFP | e2a6 | 170 | 425604 | 15497 | 3680.6 |
| + LMR | e2a6 | 170 | 360403 | 13569 | 3558.7 |
| Standard (DFS Reference) | e2a6 | 375 | 7322 | 362 | 2964.2 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 110 | 716960 | 25547 | 8820.4 |
| ID (Exhaustive) | b4f4 | 110 | 766295 | 12920 | 7112.9 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 110 | 304222 | 7320 | 3513.7 |
| + MVVLVA | b4f4 | 110 | 316219 | 7512 | 1784.1 |
| + TT | b4f4 | 110 | 324211 | 7754 | 1820.9 |
| + PST | b4f4 | 110 | 228759 | 6438 | 1820.9 |
| + Killers | b4f4 | 110 | 235667 | 6385 | 1477.0 |
| + History | b4f4 | 110 | 235672 | 6420 | 1480.5 |
| + RFP | b4f4 | 110 | 178187 | 5593 | 1480.5 |
| + FFP | b4f4 | 110 | 159614 | 5450 | 1254.1 |
| + LMR | b4f4 | 110 | 82960 | 4064 | 1247.8 |
| Standard (DFS Reference) | b4f4 | 110 | 2827 | 78 | 903.8 |


Benchmark Complete.
