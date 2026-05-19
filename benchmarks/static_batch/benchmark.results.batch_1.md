Precomputed tables initialized.
Starting Benchmark at Depth 5 with 1 Threads (Batch Size: 1)...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | d2d4 | 110 | 5071234 | 194407 | 50438.5 |
| ID (Exhaustive) | d2d4 | 110 | 5287598 | 97653 | 49406.0 |
| BPVS (ID + AB + LMP + Batches) | d2d4 | 110 | 960622 | 30590 | 9080.6 |
| + MVVLVA | d2d4 | 110 | 960622 | 30773 | 4009.0 |
| + TT | d2d4 | 110 | 941906 | 30805 | 4001.5 |
| + PST | d2d4 | 110 | 752795 | 23450 | 3952.7 |
| + Killers | d2d4 | 110 | 752785 | 23046 | 3401.0 |
| + History | d2d4 | 110 | 752838 | 23748 | 3411.0 |
| + RFP | e2e4 | 110 | 713011 | 26821 | 3411.0 |
| + FFP | d2d4 | 110 | 234464 | 16161 | 3230.0 |
| + LMR | d2d4 | 110 | 234134 | 12859 | 1612.6 |
| Standard (DFS Reference) | b1c3 | 110 | 3801 | 218 | 1597.1 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | c3d5 | 410 | 2521156 | 95676 | 9147.7 |
| + MVVLVA | c3d5 | 410 | 1764493 | 71948 | 9109.3 |
| + TT | c3d5 | 410 | 1823334 | 77726 | 7796.6 |
| + PST | c3d5 | 410 | 1558452 | 68650 | 7771.4 |
| + Killers | c3d5 | 410 | 1556777 | 68704 | 7011.3 |
| + History | c3d5 | 410 | 1556788 | 68929 | 7038.7 |
| + RFP | c3d5 | 410 | 221517 | 34546 | 7038.7 |
| + FFP | c3d5 | 330 | 3507789 | 150541 | 11033.2 |
| + LMR | c3d5 | 330 | 2338894 | 97837 | 10935.2 |
| Standard (DFS Reference) | c3d5 | 410 | 4829 | 240 | 8133.0 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 445 | 9458207 | 311150 | 18119.8 |
| + MVVLVA | e2a6 | 445 | 7711341 | 264307 | 18120.0 |
| + TT | e2a6 | 445 | 7689577 | 268910 | 17344.8 |
| + PST | e2a6 | 445 | 7143708 | 204270 | 17182.9 |
| + Killers | e2a6 | 445 | 7136534 | 203294 | 17360.2 |
| + History | e2a6 | 445 | 7144119 | 209573 | 17402.2 |
| + RFP | e2a6 | 170 | 498872 | 26529 | 17210.2 |
| + FFP | e2a6 | 170 | 425090 | 24770 | 2478.9 |
| + LMR | e2a6 | 170 | 360041 | 22009 | 2394.4 |
| Standard (DFS Reference) | e2a6 | 375 | 7322 | 359 | 1879.1 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 110 | 716960 | 25985 | 7701.9 |
| ID (Exhaustive) | b4f4 | 110 | 766295 | 23903 | 7096.8 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 110 | 261789 | 13375 | 3399.4 |
| + MVVLVA | b4f4 | 110 | 231733 | 12989 | 1422.8 |
| + TT | b4f4 | 110 | 248539 | 13637 | 1338.9 |
| + PST | b4f4 | 110 | 216471 | 13500 | 1338.9 |
| + Killers | b4f4 | 110 | 225159 | 13186 | 1306.4 |
| + History | b4f4 | 110 | 229865 | 13317 | 1359.2 |
| + RFP | b4f4 | 110 | 167759 | 12686 | 1359.2 |
| + FFP | b4f4 | 110 | 154079 | 13019 | 1216.5 |
| + LMR | b4f4 | 110 | 75730 | 8035 | 1216.5 |
| Standard (DFS Reference) | b4f4 | 110 | 2827 | 68 | 798.8 |


Benchmark Complete.
