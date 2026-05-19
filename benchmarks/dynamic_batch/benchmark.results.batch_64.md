Precomputed tables initialized.
Starting Benchmark at Depth 5 with 1 Threads (Batch Size: 64)...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | d2d4 | 110 | 5071234 | 185198 | 50541.4 |
| ID (Exhaustive) | d2d4 | 110 | 5287598 | 74898 | 49433.5 |
| BPVS (ID + AB + LMP + Batches) | d2d4 | 110 | 537447 | 13879 | 12851.7 |
| + MVVLVA | d2d4 | 110 | 537447 | 13514 | 2562.9 |
| + TT | d2d4 | 110 | 560379 | 14210 | 2592.9 |
| + PST | d2d4 | 110 | 396845 | 10968 | 2592.7 |
| + Killers | d2d4 | 110 | 397953 | 10958 | 2235.0 |
| + History | d2d4 | 110 | 397927 | 11211 | 2248.3 |
| + RFP | e2e4 | 110 | 657319 | 15980 | 3181.9 |
| + FFP | d2d4 | 110 | 150013 | 7139 | 3181.9 |
| + LMR | d2d4 | 110 | 149702 | 6852 | 1520.2 |
| Standard (DFS Reference) | b1c3 | 110 | 3801 | 196 | 1513.7 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | c3d5 | 410 | 3389413 | 81995 | 12274.2 |
| + MVVLVA | c4d5 | 340 | 992776 | 27208 | 12247.7 |
| + TT | c4d5 | 340 | 982576 | 26977 | 3861.5 |
| + PST | c3d5 | 410 | 907532 | 24937 | 3842.6 |
| + Killers | c3d5 | 410 | 907532 | 24349 | 3539.8 |
| + History | c3d5 | 410 | 907095 | 24536 | 3539.8 |
| + RFP | c3d5 | 410 | 68591 | 5620 | 3508.4 |
| + FFP | c3d5 | 330 | 3629111 | 89136 | 16655.5 |
| + LMR | c3d5 | 330 | 2398282 | 64215 | 16591.5 |
| Standard (DFS Reference) | c3d5 | 410 | 4829 | 219 | 9309.2 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 445 | 10245183 | 254160 | 29122.4 |
| + MVVLVA | e2a6 | 445 | 7586932 | 192074 | 28232.5 |
| + TT | e2a6 | 445 | 7614883 | 195302 | 24651.3 |
| + PST | e2a6 | 445 | 7010164 | 167838 | 24459.4 |
| + Killers | e2a6 | 445 | 7011635 | 170468 | 23136.9 |
| + History | e2a6 | 445 | 7010815 | 168884 | 23374.8 |
| + RFP | e2a6 | 170 | 493386 | 17623 | 23148.9 |
| + FFP | e2a6 | 170 | 420911 | 16127 | 2826.9 |
| + LMR | e2a6 | 170 | 355845 | 14550 | 2747.8 |
| Standard (DFS Reference) | e2a6 | 375 | 7322 | 360 | 2763.0 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 110 | 716960 | 25537 | 8240.0 |
| ID (Exhaustive) | b4f4 | 110 | 766295 | 15058 | 7110.7 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 110 | 217111 | 7229 | 3353.8 |
| + MVVLVA | b4f4 | 110 | 264874 | 7771 | 1543.1 |
| + TT | b4f4 | 110 | 226736 | 7598 | 1543.1 |
| + PST | b4f4 | 110 | 171460 | 6703 | 1408.2 |
| + Killers | b4f4 | 110 | 180356 | 6899 | 1253.4 |
| + History | b4f4 | 110 | 180342 | 6917 | 1258.4 |
| + RFP | b4f4 | 110 | 137775 | 6184 | 1258.4 |
| + FFP | b4f4 | 110 | 113913 | 6087 | 1092.3 |
| + LMR | b4f4 | 110 | 35192 | 4076 | 1012.2 |
| Standard (DFS Reference) | b4f4 | 110 | 2827 | 72 | 657.1 |


Benchmark Complete.
