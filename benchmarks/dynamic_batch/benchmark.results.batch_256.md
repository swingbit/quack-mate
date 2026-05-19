Precomputed tables initialized.
Starting Benchmark at Depth 5 with 1 Threads (Batch Size: 256)...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | d2d4 | 110 | 5071234 | 186757 | 50518.1 |
| ID (Exhaustive) | d2d4 | 110 | 5287598 | 75182 | 49416.7 |
| BPVS (ID + AB + LMP + Batches) | d2d4 | 110 | 537447 | 14134 | 12807.8 |
| + MVVLVA | d2d4 | 110 | 537447 | 13537 | 2568.0 |
| + TT | d2d4 | 110 | 560379 | 14161 | 2616.2 |
| + PST | d2d4 | 110 | 396845 | 10948 | 2616.1 |
| + Killers | d2d4 | 110 | 397953 | 11001 | 2244.7 |
| + History | d2d4 | 110 | 397927 | 11034 | 2249.9 |
| + RFP | e2e4 | 110 | 657319 | 15818 | 3162.8 |
| + FFP | d2d4 | 110 | 150013 | 7157 | 3162.8 |
| + LMR | d2d4 | 110 | 149702 | 6863 | 1513.8 |
| Standard (DFS Reference) | b1c3 | 110 | 3801 | 198 | 1510.6 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | c3d5 | 410 | 3389413 | 80215 | 12327.4 |
| + MVVLVA | c4d5 | 340 | 992776 | 26223 | 12222.2 |
| + TT | c4d5 | 340 | 982576 | 26800 | 3851.3 |
| + PST | c3d5 | 410 | 907532 | 24573 | 3839.5 |
| + Killers | c3d5 | 410 | 907532 | 24835 | 3478.2 |
| + History | c3d5 | 410 | 907095 | 24668 | 3507.1 |
| + RFP | c3d5 | 410 | 68591 | 5702 | 3507.1 |
| + FFP | c3d5 | 330 | 3629111 | 88540 | 16684.9 |
| + LMR | c3d5 | 330 | 2398282 | 64125 | 16620.9 |
| Standard (DFS Reference) | c3d5 | 410 | 4829 | 234 | 9279.3 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 445 | 10245183 | 254271 | 28803.6 |
| + MVVLVA | e2a6 | 445 | 7586932 | 188669 | 28561.3 |
| + TT | e2a6 | 445 | 7614883 | 195123 | 24334.7 |
| + PST | e2a6 | 445 | 7010164 | 166372 | 24105.6 |
| + Killers | e2a6 | 445 | 7011635 | 167985 | 22745.8 |
| + History | e2a6 | 445 | 7010815 | 169612 | 23438.2 |
| + RFP | e2a6 | 170 | 493386 | 17558 | 23246.5 |
| + FFP | e2a6 | 170 | 420911 | 16433 | 2828.4 |
| + LMR | e2a6 | 170 | 355845 | 14592 | 2755.9 |
| Standard (DFS Reference) | e2a6 | 375 | 7322 | 363 | 2770.2 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 110 | 716960 | 25630 | 8245.5 |
| ID (Exhaustive) | b4f4 | 110 | 766295 | 14643 | 7118.2 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 110 | 217111 | 7274 | 3353.4 |
| + MVVLVA | b4f4 | 110 | 264874 | 7890 | 1549.4 |
| + TT | b4f4 | 110 | 226736 | 7501 | 1549.4 |
| + PST | b4f4 | 110 | 171460 | 6760 | 1412.2 |
| + Killers | b4f4 | 110 | 180356 | 6933 | 1249.7 |
| + History | b4f4 | 110 | 180342 | 7031 | 1256.3 |
| + RFP | b4f4 | 110 | 137775 | 6395 | 1256.3 |
| + FFP | b4f4 | 110 | 113913 | 6144 | 1099.1 |
| + LMR | b4f4 | 110 | 35192 | 4208 | 1018.7 |
| Standard (DFS Reference) | b4f4 | 110 | 2827 | 72 | 658.0 |


Benchmark Complete.
