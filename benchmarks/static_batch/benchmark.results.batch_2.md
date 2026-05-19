Precomputed tables initialized.
Starting Benchmark at Depth 5 with 1 Threads (Batch Size: 2)...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | d2d4 | 110 | 5071234 | 187330 | 50382.6 |
| ID (Exhaustive) | d2d4 | 110 | 5287598 | 89790 | 49384.8 |
| BPVS (ID + AB + LMP + Batches) | d2d4 | 110 | 892498 | 22360 | 9546.6 |
| + MVVLVA | d2d4 | 110 | 892498 | 21840 | 3879.9 |
| + TT | d2d4 | 110 | 957446 | 26032 | 3902.6 |
| + PST | d2d4 | 110 | 752809 | 19755 | 3902.6 |
| + Killers | d2d4 | 110 | 752770 | 19603 | 3312.9 |
| + History | d2d4 | 110 | 752817 | 18872 | 3342.0 |
| + RFP | e2e4 | 110 | 713023 | 21769 | 3342.0 |
| + FFP | d2d4 | 110 | 234464 | 12244 | 3023.3 |
| + LMR | d2d4 | 110 | 234176 | 10327 | 1598.8 |
| Standard (DFS Reference) | b1c3 | 110 | 3801 | 215 | 1565.1 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | c3d5 | 410 | 3051983 | 94225 | 9834.1 |
| + MVVLVA | c3d5 | 335 | 1735474 | 55542 | 9834.1 |
| + TT | c3d5 | 335 | 1801556 | 58668 | 7382.5 |
| + PST | c3d5 | 410 | 1560482 | 51941 | 7382.5 |
| + Killers | c3d5 | 410 | 1559932 | 52496 | 6966.4 |
| + History | c3d5 | 410 | 1559882 | 54131 | 7026.5 |
| + RFP | c3d5 | 410 | 222626 | 21575 | 6865.1 |
| + FFP | c3d5 | 330 | 3525482 | 119131 | 11533.5 |
| + LMR | c3d5 | 330 | 2350009 | 80507 | 11435.1 |
| Standard (DFS Reference) | c3d5 | 410 | 4829 | 244 | 7927.8 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 445 | 9508795 | 269764 | 18325.3 |
| + MVVLVA | e2a6 | 445 | 7728099 | 215747 | 18324.9 |
| + TT | e2a6 | 445 | 7739003 | 225679 | 18437.0 |
| + PST | e2a6 | 445 | 7137295 | 185653 | 18249.8 |
| + Killers | e2a6 | 445 | 7134549 | 184866 | 18002.9 |
| + History | e2a6 | 445 | 7143700 | 188027 | 18289.3 |
| + RFP | e2a6 | 170 | 498890 | 20586 | 18097.4 |
| + FFP | e2a6 | 170 | 425485 | 19781 | 2473.3 |
| + LMR | e2a6 | 170 | 359740 | 17107 | 2304.4 |
| Standard (DFS Reference) | e2a6 | 375 | 7322 | 346 | 2045.4 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 110 | 716960 | 25294 | 7782.1 |
| ID (Exhaustive) | b4f4 | 110 | 766295 | 18948 | 7081.7 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 110 | 274454 | 9804 | 2913.5 |
| + MVVLVA | b4f4 | 110 | 253462 | 9616 | 1424.3 |
| + TT | b4f4 | 110 | 262745 | 10084 | 1351.6 |
| + PST | b4f4 | 110 | 217812 | 9310 | 1347.1 |
| + Killers | b4f4 | 110 | 230006 | 9578 | 1217.1 |
| + History | b4f4 | 110 | 233895 | 9805 | 1231.4 |
| + RFP | b4f4 | 110 | 167929 | 8657 | 1231.4 |
| + FFP | b4f4 | 110 | 157790 | 8960 | 1047.6 |
| + LMR | b4f4 | 110 | 76429 | 5853 | 1047.6 |
| Standard (DFS Reference) | b4f4 | 110 | 2827 | 69 | 790.8 |


Benchmark Complete.
