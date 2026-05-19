Precomputed tables initialized.
Starting Benchmark at Depth 5 with 1 Threads (Batch Size: 128)...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | d2d4 | 110 | 5071234 | 184441 | 50529.5 |
| ID (Exhaustive) | d2d4 | 110 | 5287598 | 75134 | 49478.8 |
| BPVS (ID + AB + LMP + Batches) | d2d4 | 110 | 537447 | 14291 | 12922.1 |
| + MVVLVA | d2d4 | 110 | 537447 | 13769 | 2580.2 |
| + TT | d2d4 | 110 | 560379 | 14431 | 2602.4 |
| + PST | d2d4 | 110 | 396845 | 10796 | 2602.4 |
| + Killers | d2d4 | 110 | 397953 | 10951 | 2256.6 |
| + History | d2d4 | 110 | 397927 | 11069 | 2256.6 |
| + RFP | e2e4 | 110 | 657319 | 16133 | 3162.3 |
| + FFP | d2d4 | 110 | 150013 | 7113 | 3162.3 |
| + LMR | d2d4 | 110 | 149702 | 6808 | 1521.3 |
| Standard (DFS Reference) | b1c3 | 110 | 3801 | 211 | 1529.7 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | c3d5 | 410 | 3389413 | 79745 | 12450.1 |
| + MVVLVA | c4d5 | 340 | 992776 | 26164 | 12446.2 |
| + TT | c4d5 | 340 | 982576 | 26800 | 3858.6 |
| + PST | c3d5 | 410 | 907532 | 24870 | 3858.3 |
| + Killers | c3d5 | 410 | 907532 | 24275 | 3482.8 |
| + History | c3d5 | 410 | 907095 | 24928 | 3531.2 |
| + RFP | c3d5 | 410 | 68591 | 5964 | 3531.2 |
| + FFP | c3d5 | 330 | 3629111 | 88849 | 16699.0 |
| + LMR | c3d5 | 330 | 2398282 | 64038 | 16635.0 |
| Standard (DFS Reference) | c3d5 | 410 | 4829 | 219 | 9317.1 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 445 | 10245183 | 253438 | 28405.1 |
| + MVVLVA | e2a6 | 445 | 7586932 | 188979 | 27914.2 |
| + TT | e2a6 | 445 | 7614883 | 194035 | 24145.8 |
| + PST | e2a6 | 445 | 7010164 | 166740 | 23890.5 |
| + Killers | e2a6 | 445 | 7011635 | 169088 | 22925.2 |
| + History | e2a6 | 445 | 7010815 | 169485 | 23386.1 |
| + RFP | e2a6 | 170 | 493386 | 17392 | 23194.1 |
| + FFP | e2a6 | 170 | 420911 | 16045 | 2820.8 |
| + LMR | e2a6 | 170 | 355845 | 14330 | 2754.0 |
| Standard (DFS Reference) | e2a6 | 375 | 7322 | 346 | 2764.0 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 110 | 716960 | 25648 | 8225.7 |
| ID (Exhaustive) | b4f4 | 110 | 766295 | 14823 | 7093.9 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 110 | 217111 | 7308 | 3344.9 |
| + MVVLVA | b4f4 | 110 | 264874 | 7721 | 1525.2 |
| + TT | b4f4 | 110 | 226736 | 7579 | 1525.2 |
| + PST | b4f4 | 110 | 171460 | 6723 | 1396.4 |
| + Killers | b4f4 | 110 | 180356 | 6609 | 1232.7 |
| + History | b4f4 | 110 | 180342 | 6695 | 1232.7 |
| + RFP | b4f4 | 110 | 137775 | 6373 | 1230.5 |
| + FFP | b4f4 | 110 | 113913 | 6242 | 1080.0 |
| + LMR | b4f4 | 110 | 35192 | 4270 | 1006.3 |
| Standard (DFS Reference) | b4f4 | 110 | 2827 | 75 | 638.7 |


Benchmark Complete.
