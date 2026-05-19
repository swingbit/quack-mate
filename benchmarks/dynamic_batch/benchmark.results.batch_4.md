Precomputed tables initialized.
Starting Benchmark at Depth 5 with 1 Threads (Batch Size: 4)...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | d2d4 | 110 | 5071234 | 187222 | 50495.1 |
| ID (Exhaustive) | d2d4 | 110 | 5287598 | 77110 | 49088.2 |
| BPVS (ID + AB + LMP + Batches) | d2d4 | 110 | 833926 | 20272 | 11465.8 |
| + MVVLVA | d2d4 | 110 | 833926 | 19199 | 3315.3 |
| + TT | d2d4 | 110 | 496131 | 13464 | 3292.4 |
| + PST | d2d4 | 110 | 396861 | 11381 | 2250.1 |
| + Killers | d2d4 | 110 | 397899 | 11400 | 2038.3 |
| + History | d2d4 | 110 | 397927 | 11421 | 2044.8 |
| + RFP | e2e4 | 110 | 657298 | 16585 | 2725.7 |
| + FFP | d2d4 | 110 | 150013 | 7709 | 2725.7 |
| + LMR | d2d4 | 110 | 149702 | 7288 | 1314.5 |
| Standard (DFS Reference) | b1c3 | 110 | 3801 | 207 | 1303.3 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | c4d5 | 340 | 3159716 | 83216 | 11467.1 |
| + MVVLVA | c3d5 | 410 | 959437 | 30172 | 11467.1 |
| + TT | c3d5 | 410 | 948776 | 31235 | 3872.7 |
| + PST | c3d5 | 410 | 907576 | 29391 | 3872.7 |
| + Killers | c3d5 | 410 | 907482 | 29361 | 3673.0 |
| + History | c3d5 | 410 | 907521 | 29473 | 3748.9 |
| + RFP | c3d5 | 410 | 68591 | 10208 | 3736.7 |
| + FFP | c3d5 | 330 | 3629022 | 101771 | 13404.1 |
| + LMR | c3d5 | 330 | 2398268 | 70866 | 13281.1 |
| Standard (DFS Reference) | c3d5 | 410 | 4829 | 233 | 8300.4 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 445 | 9657472 | 256636 | 22495.1 |
| + MVVLVA | e2a6 | 445 | 7617773 | 200617 | 22365.7 |
| + TT | e2a6 | 445 | 7614705 | 203503 | 22288.0 |
| + PST | e2a6 | 445 | 7009938 | 170314 | 22096.1 |
| + Killers | e2a6 | 445 | 7010173 | 170447 | 21838.8 |
| + History | e2a6 | 445 | 7018789 | 173185 | 21687.6 |
| + RFP | e2a6 | 170 | 493386 | 18016 | 21495.7 |
| + FFP | e2a6 | 170 | 420911 | 17028 | 2541.5 |
| + LMR | e2a6 | 170 | 355845 | 15072 | 2446.4 |
| Standard (DFS Reference) | e2a6 | 375 | 7322 | 354 | 2456.0 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 110 | 716960 | 25580 | 7934.3 |
| ID (Exhaustive) | b4f4 | 110 | 766295 | 15519 | 7093.5 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 110 | 217111 | 7681 | 3267.6 |
| + MVVLVA | b4f4 | 110 | 264874 | 8109 | 1532.9 |
| + TT | b4f4 | 110 | 226736 | 8081 | 1532.9 |
| + PST | b4f4 | 110 | 162995 | 6745 | 1381.7 |
| + Killers | b4f4 | 110 | 176486 | 7116 | 1216.5 |
| + History | b4f4 | 110 | 176441 | 7422 | 1234.2 |
| + RFP | b4f4 | 110 | 133852 | 6660 | 1234.2 |
| + FFP | b4f4 | 110 | 109582 | 6523 | 1058.4 |
| + LMR | b4f4 | 110 | 35192 | 4488 | 988.3 |
| Standard (DFS Reference) | b4f4 | 110 | 2827 | 72 | 650.1 |


Benchmark Complete.
