Precomputed tables initialized.
Starting Benchmark at Depth 5 with 1 Threads (Batch Size: 256)...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | d2d4 | 110 | 5071234 | 185115 | 50539.0 |
| ID (Exhaustive) | d2d4 | 110 | 5287598 | 69477 | 49510.4 |
| BPVS (ID + AB + LMP + Batches) | d2d4 | 110 | 1160683 | 22457 | 12691.7 |
| + MVVLVA | d2d4 | 110 | 1160683 | 22133 | 5522.8 |
| + TT | d2d4 | 110 | 1149426 | 22248 | 5527.0 |
| + PST | d2d4 | 110 | 752765 | 14155 | 5524.4 |
| + Killers | d2d4 | 110 | 752778 | 14345 | 4032.2 |
| + History | d2d4 | 110 | 752775 | 14449 | 4055.5 |
| + RFP | e2e4 | 110 | 713007 | 14698 | 4055.5 |
| + FFP | d2d4 | 110 | 234464 | 7684 | 4012.9 |
| + LMR | d2d4 | 110 | 234176 | 7233 | 2281.5 |
| Standard (DFS Reference) | b1c3 | 110 | 3801 | 201 | 2284.2 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | c3d5 | 410 | 4670194 | 105223 | 19572.3 |
| + MVVLVA | c3d5 | 375 | 1821127 | 42565 | 19485.1 |
| + TT | c3d5 | 335 | 1851211 | 43486 | 7942.6 |
| + PST | c3d5 | 410 | 1760072 | 40442 | 7941.2 |
| + Killers | c3d5 | 410 | 1761686 | 40154 | 7499.5 |
| + History | c3d5 | 410 | 1761464 | 40717 | 7600.6 |
| + RFP | c3d5 | 410 | 222912 | 8860 | 7600.6 |
| + FFP | c3d5 | 330 | 3868908 | 86797 | 18512.8 |
| + LMR | c3d5 | 330 | 2567270 | 64006 | 18401.1 |
| Standard (DFS Reference) | c3d5 | 410 | 4829 | 251 | 12564.1 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 445 | 9866322 | 241061 | 24353.8 |
| + MVVLVA | e2a6 | 445 | 7743832 | 184260 | 24353.8 |
| + TT | e2a6 | 445 | 7714599 | 192784 | 23242.3 |
| + PST | e2a6 | 445 | 7145929 | 163926 | 22983.7 |
| + Killers | e2a6 | 445 | 7135279 | 168650 | 22736.9 |
| + History | e2a6 | 445 | 7135437 | 169018 | 22962.0 |
| + RFP | e2a6 | 170 | 499486 | 17087 | 22733.9 |
| + FFP | e2a6 | 170 | 425604 | 15556 | 3707.7 |
| + LMR | e2a6 | 170 | 360403 | 13861 | 3578.4 |
| Standard (DFS Reference) | e2a6 | 375 | 7322 | 376 | 2995.7 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 110 | 716960 | 26557 | 8844.2 |
| ID (Exhaustive) | b4f4 | 110 | 766295 | 13442 | 7140.1 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 110 | 304222 | 7313 | 3509.7 |
| + MVVLVA | b4f4 | 110 | 316219 | 7794 | 1795.7 |
| + TT | b4f4 | 110 | 324211 | 7824 | 1844.4 |
| + PST | b4f4 | 110 | 228759 | 6402 | 1844.4 |
| + Killers | b4f4 | 110 | 235667 | 6175 | 1495.8 |
| + History | b4f4 | 110 | 235672 | 6287 | 1505.4 |
| + RFP | b4f4 | 110 | 178187 | 5589 | 1505.4 |
| + FFP | b4f4 | 110 | 159614 | 5616 | 1278.2 |
| + LMR | b4f4 | 110 | 82960 | 4087 | 1263.6 |
| Standard (DFS Reference) | b4f4 | 110 | 2827 | 74 | 918.7 |


Benchmark Complete.
