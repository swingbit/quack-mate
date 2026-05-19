Precomputed tables initialized.
Starting Benchmark at Depth 5 with 1 Threads (Batch Size: 2)...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | d2d4 | 110 | 5071234 | 187119 | 50276.9 |
| ID (Exhaustive) | d2d4 | 110 | 5287598 | 81347 | 49148.1 |
| BPVS (ID + AB + LMP + Batches) | d2d4 | 110 | 585650 | 16763 | 11707.3 |
| + MVVLVA | d2d4 | 110 | 585650 | 16207 | 2868.2 |
| + TT | d2d4 | 110 | 592102 | 16660 | 2825.1 |
| + PST | d2d4 | 110 | 396882 | 12500 | 2719.4 |
| + Killers | d2d4 | 110 | 397953 | 12511 | 2226.9 |
| + History | d2d4 | 110 | 397927 | 12721 | 2232.5 |
| + RFP | e2e4 | 110 | 657298 | 18248 | 2964.6 |
| + FFP | d2d4 | 110 | 150013 | 8863 | 2964.6 |
| + LMR | d2d4 | 110 | 149702 | 7900 | 1520.6 |
| Standard (DFS Reference) | b1c3 | 110 | 3801 | 211 | 1510.0 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | c3d5 | 410 | 2745671 | 79730 | 9924.4 |
| + MVVLVA | c3d5 | 410 | 987983 | 36709 | 9924.4 |
| + TT | c3d5 | 375 | 915655 | 35451 | 3828.0 |
| + PST | c3d5 | 410 | 907488 | 34337 | 3699.0 |
| + Killers | c3d5 | 410 | 907504 | 34699 | 3729.3 |
| + History | c3d5 | 410 | 907462 | 34733 | 3778.0 |
| + RFP | c3d5 | 410 | 68591 | 14705 | 3778.0 |
| + FFP | c3d5 | 330 | 3629016 | 114677 | 12576.0 |
| + LMR | c3d5 | 330 | 2398455 | 76569 | 12475.9 |
| Standard (DFS Reference) | c3d5 | 410 | 4829 | 246 | 7917.9 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 445 | 9639955 | 272156 | 21439.4 |
| + MVVLVA | e2a6 | 445 | 7641050 | 209998 | 21439.2 |
| + TT | e2a6 | 445 | 7607138 | 217371 | 20460.2 |
| + PST | e2a6 | 445 | 7011084 | 175614 | 20270.2 |
| + Killers | e2a6 | 445 | 7011418 | 174322 | 19879.6 |
| + History | e2a6 | 445 | 7019654 | 177258 | 20149.0 |
| + RFP | e2a6 | 170 | 493386 | 19235 | 19903.9 |
| + FFP | e2a6 | 170 | 420911 | 18054 | 2438.4 |
| + LMR | e2a6 | 170 | 355845 | 15837 | 2343.2 |
| Standard (DFS Reference) | e2a6 | 375 | 7322 | 355 | 2351.1 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 110 | 716960 | 25485 | 7805.5 |
| ID (Exhaustive) | b4f4 | 110 | 766295 | 15969 | 7094.1 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 110 | 217111 | 8229 | 3127.0 |
| + MVVLVA | b4f4 | 110 | 264874 | 8777 | 1545.9 |
| + TT | b4f4 | 110 | 226736 | 8364 | 1545.9 |
| + PST | b4f4 | 110 | 162931 | 7519 | 1411.8 |
| + Killers | b4f4 | 110 | 176514 | 7854 | 1203.7 |
| + History | b4f4 | 110 | 176458 | 7792 | 1205.5 |
| + RFP | b4f4 | 110 | 133932 | 7455 | 1205.5 |
| + FFP | b4f4 | 110 | 109579 | 7060 | 1041.0 |
| + LMR | b4f4 | 110 | 35192 | 4681 | 963.8 |
| Standard (DFS Reference) | b4f4 | 110 | 2827 | 70 | 654.7 |


Benchmark Complete.
