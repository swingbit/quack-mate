Precomputed tables initialized.
Starting Benchmark at Depth 5 with 1 Threads (Batch Size: 4)...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | d2d4 | 110 | 5071234 | 185295 | 50397.8 |
| ID (Exhaustive) | d2d4 | 110 | 5287598 | 80007 | 49160.6 |
| BPVS (ID + AB + LMP + Batches) | d2d4 | 110 | 986442 | 22325 | 11145.1 |
| + MVVLVA | d2d4 | 110 | 986442 | 21529 | 3931.0 |
| + TT | d2d4 | 110 | 770480 | 17498 | 3906.2 |
| + PST | d2d4 | 110 | 752813 | 16144 | 3512.2 |
| + Killers | d2d4 | 110 | 752833 | 15988 | 3451.8 |
| + History | d2d4 | 110 | 752780 | 16301 | 3451.8 |
| + RFP | e2e4 | 110 | 713046 | 17280 | 3447.3 |
| + FFP | d2d4 | 110 | 234464 | 9144 | 2889.1 |
| + LMR | d2d4 | 110 | 234176 | 8146 | 1689.0 |
| Standard (DFS Reference) | b1c3 | 110 | 3801 | 213 | 1670.8 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | c3d5 | 410 | 2593504 | 69084 | 9632.6 |
| + MVVLVA | c3d5 | 335 | 1801505 | 49547 | 9585.3 |
| + TT | c3d5 | 410 | 1809933 | 50114 | 7571.6 |
| + PST | c3d5 | 410 | 1588880 | 44570 | 7571.6 |
| + Killers | c3d5 | 410 | 1587373 | 44921 | 6806.9 |
| + History | c3d5 | 410 | 1587697 | 44923 | 6921.8 |
| + RFP | c3d5 | 410 | 221590 | 14859 | 6885.1 |
| + FFP | c3d5 | 330 | 3571748 | 103170 | 13149.5 |
| + LMR | c3d5 | 330 | 2378652 | 70878 | 13028.1 |
| Standard (DFS Reference) | c3d5 | 410 | 4829 | 246 | 8318.1 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 445 | 9603214 | 254541 | 20220.6 |
| + MVVLVA | e2a6 | 445 | 7726016 | 202396 | 20168.6 |
| + TT | e2a6 | 445 | 7708416 | 205163 | 20131.6 |
| + PST | e2a6 | 445 | 7136819 | 174894 | 20482.7 |
| + Killers | e2a6 | 445 | 7135005 | 176381 | 20219.9 |
| + History | e2a6 | 445 | 7143058 | 177602 | 20452.1 |
| + RFP | e2a6 | 170 | 499502 | 18241 | 20213.0 |
| + FFP | e2a6 | 170 | 425993 | 16962 | 2860.7 |
| + LMR | e2a6 | 170 | 360708 | 15105 | 2705.9 |
| Standard (DFS Reference) | e2a6 | 375 | 7322 | 373 | 2096.0 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 110 | 716960 | 25576 | 7921.4 |
| ID (Exhaustive) | b4f4 | 110 | 766295 | 16442 | 7087.2 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 110 | 274496 | 8095 | 2894.7 |
| + MVVLVA | b4f4 | 110 | 211924 | 7588 | 1382.6 |
| + TT | b4f4 | 110 | 283238 | 8843 | 1390.7 |
| + PST | b4f4 | 110 | 218895 | 7831 | 1390.7 |
| + Killers | b4f4 | 110 | 233784 | 7877 | 1250.8 |
| + History | b4f4 | 110 | 225429 | 7886 | 1261.7 |
| + RFP | b4f4 | 110 | 168013 | 6980 | 1261.7 |
| + FFP | b4f4 | 110 | 154309 | 7558 | 1089.9 |
| + LMR | b4f4 | 110 | 77395 | 4896 | 1081.0 |
| Standard (DFS Reference) | b4f4 | 110 | 2827 | 69 | 769.9 |


Benchmark Complete.
