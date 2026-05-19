Precomputed tables initialized.
Starting Benchmark at Depth 5 with 1 Threads (Batch Size: 16)...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | d2d4 | 110 | 5071234 | 185872 | 50529.8 |
| ID (Exhaustive) | d2d4 | 110 | 5287598 | 75312 | 49483.8 |
| BPVS (ID + AB + LMP + Batches) | d2d4 | 110 | 537447 | 13872 | 13022.6 |
| + MVVLVA | d2d4 | 110 | 537447 | 13827 | 2587.4 |
| + TT | d2d4 | 110 | 560379 | 14362 | 2612.5 |
| + PST | d2d4 | 110 | 396845 | 10984 | 2612.3 |
| + Killers | d2d4 | 110 | 397953 | 10847 | 2259.0 |
| + History | d2d4 | 110 | 397927 | 11118 | 2259.0 |
| + RFP | e2e4 | 110 | 657319 | 16125 | 3176.4 |
| + FFP | d2d4 | 110 | 150013 | 7346 | 3176.4 |
| + LMR | d2d4 | 110 | 149702 | 7110 | 1545.8 |
| Standard (DFS Reference) | b1c3 | 110 | 3801 | 207 | 1534.4 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | c3d5 | 410 | 3304578 | 80586 | 11933.1 |
| + MVVLVA | c4d5 | 340 | 992776 | 28077 | 11880.5 |
| + TT | c4d5 | 340 | 982576 | 27749 | 3907.4 |
| + PST | c3d5 | 410 | 907532 | 26084 | 3867.3 |
| + Killers | c3d5 | 410 | 907532 | 25547 | 3538.7 |
| + History | c3d5 | 410 | 907095 | 25776 | 3545.0 |
| + RFP | c3d5 | 410 | 68591 | 6648 | 3545.0 |
| + FFP | c3d5 | 330 | 3629111 | 92165 | 16752.2 |
| + LMR | c3d5 | 330 | 2398282 | 65165 | 16628.0 |
| Standard (DFS Reference) | c3d5 | 410 | 4829 | 216 | 9493.7 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 445 | 9729602 | 240493 | 25266.8 |
| + MVVLVA | e2a6 | 445 | 7607542 | 191500 | 24922.2 |
| + TT | e2a6 | 445 | 7640495 | 196380 | 23396.6 |
| + PST | e2a6 | 445 | 7010164 | 166996 | 23552.4 |
| + Killers | e2a6 | 445 | 7011635 | 168764 | 23360.4 |
| + History | e2a6 | 445 | 7010815 | 170545 | 23437.4 |
| + RFP | e2a6 | 170 | 493386 | 17156 | 23245.6 |
| + FFP | e2a6 | 170 | 420911 | 16323 | 2841.9 |
| + LMR | e2a6 | 170 | 355845 | 14582 | 2745.2 |
| Standard (DFS Reference) | e2a6 | 375 | 7322 | 364 | 2751.0 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 110 | 716960 | 25444 | 8227.3 |
| ID (Exhaustive) | b4f4 | 110 | 766295 | 14878 | 7096.4 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 110 | 217111 | 7363 | 3331.7 |
| + MVVLVA | b4f4 | 110 | 264874 | 7836 | 1521.7 |
| + TT | b4f4 | 110 | 226736 | 7536 | 1521.7 |
| + PST | b4f4 | 110 | 171460 | 6780 | 1388.9 |
| + Killers | b4f4 | 110 | 180356 | 6919 | 1231.1 |
| + History | b4f4 | 110 | 180342 | 6958 | 1238.4 |
| + RFP | b4f4 | 110 | 137775 | 6147 | 1238.4 |
| + FFP | b4f4 | 110 | 113913 | 5927 | 1081.0 |
| + LMR | b4f4 | 110 | 35192 | 4180 | 998.1 |
| Standard (DFS Reference) | b4f4 | 110 | 2827 | 73 | 645.5 |


Benchmark Complete.
