Precomputed tables initialized.
Starting Benchmark at Depth 5 with 1 Threads (Batch Size: 32)...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | d2d4 | 110 | 5071234 | 185032 | 50534.7 |
| ID (Exhaustive) | d2d4 | 110 | 5287598 | 75247 | 49422.6 |
| BPVS (ID + AB + LMP + Batches) | d2d4 | 110 | 537447 | 14016 | 13176.3 |
| + MVVLVA | d2d4 | 110 | 537447 | 13740 | 2610.5 |
| + TT | d2d4 | 110 | 560379 | 14093 | 2652.3 |
| + PST | d2d4 | 110 | 396845 | 11059 | 2652.1 |
| + Killers | d2d4 | 110 | 397953 | 10908 | 2269.4 |
| + History | d2d4 | 110 | 397927 | 11051 | 2290.7 |
| + RFP | e2e4 | 110 | 657319 | 15962 | 3193.6 |
| + FFP | d2d4 | 110 | 150013 | 7252 | 3193.6 |
| + LMR | d2d4 | 110 | 149702 | 6902 | 1563.9 |
| Standard (DFS Reference) | b1c3 | 110 | 3801 | 204 | 1549.2 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | c3d5 | 410 | 3389413 | 81178 | 12317.7 |
| + MVVLVA | c4d5 | 340 | 992776 | 27298 | 12314.8 |
| + TT | c4d5 | 340 | 982576 | 27617 | 3894.4 |
| + PST | c3d5 | 410 | 907532 | 25125 | 3873.1 |
| + Killers | c3d5 | 410 | 907532 | 25294 | 3516.8 |
| + History | c3d5 | 410 | 907095 | 24932 | 3563.5 |
| + RFP | c3d5 | 410 | 68591 | 6073 | 3563.5 |
| + FFP | c3d5 | 330 | 3629111 | 90397 | 16771.2 |
| + LMR | c3d5 | 330 | 2398282 | 65061 | 16532.1 |
| Standard (DFS Reference) | c3d5 | 410 | 4829 | 230 | 9312.8 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 445 | 9687127 | 243404 | 27634.1 |
| + MVVLVA | e2a6 | 445 | 7618831 | 190668 | 27425.4 |
| + TT | e2a6 | 445 | 7617411 | 193870 | 25204.4 |
| + PST | e2a6 | 445 | 7010164 | 166935 | 25011.0 |
| + Killers | e2a6 | 445 | 7011635 | 169450 | 23579.0 |
| + History | e2a6 | 445 | 7010815 | 168980 | 23470.9 |
| + RFP | e2a6 | 170 | 493386 | 17764 | 23278.9 |
| + FFP | e2a6 | 170 | 420911 | 16102 | 2817.4 |
| + LMR | e2a6 | 170 | 355845 | 14493 | 2751.6 |
| Standard (DFS Reference) | e2a6 | 375 | 7322 | 345 | 2761.9 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 110 | 716960 | 25619 | 8240.6 |
| ID (Exhaustive) | b4f4 | 110 | 766295 | 14881 | 7109.6 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 110 | 217111 | 7421 | 3344.1 |
| + MVVLVA | b4f4 | 110 | 264874 | 7862 | 1542.9 |
| + TT | b4f4 | 110 | 226736 | 7586 | 1542.9 |
| + PST | b4f4 | 110 | 171460 | 6888 | 1407.9 |
| + Killers | b4f4 | 110 | 180356 | 6756 | 1248.4 |
| + History | b4f4 | 110 | 180342 | 6854 | 1260.3 |
| + RFP | b4f4 | 110 | 137775 | 6177 | 1260.3 |
| + FFP | b4f4 | 110 | 113913 | 5862 | 1093.0 |
| + LMR | b4f4 | 110 | 35192 | 4126 | 1014.3 |
| Standard (DFS Reference) | b4f4 | 110 | 2827 | 71 | 655.7 |


Benchmark Complete.
