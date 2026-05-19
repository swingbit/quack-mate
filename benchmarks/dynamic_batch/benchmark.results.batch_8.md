Precomputed tables initialized.
Starting Benchmark at Depth 5 with 1 Threads (Batch Size: 8)...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | d2d4 | 110 | 5071234 | 188240 | 50518.9 |
| ID (Exhaustive) | d2d4 | 110 | 5287598 | 75062 | 49474.7 |
| BPVS (ID + AB + LMP + Batches) | d2d4 | 110 | 537447 | 13704 | 12850.9 |
| + MVVLVA | d2d4 | 110 | 537447 | 13405 | 2584.1 |
| + TT | d2d4 | 110 | 560379 | 14237 | 2603.6 |
| + PST | d2d4 | 110 | 396845 | 10847 | 2591.6 |
| + Killers | d2d4 | 110 | 397953 | 10998 | 2238.6 |
| + History | d2d4 | 110 | 397927 | 11236 | 2239.3 |
| + RFP | e2e4 | 110 | 657319 | 16255 | 3172.3 |
| + FFP | d2d4 | 110 | 150013 | 7261 | 3172.3 |
| + LMR | d2d4 | 110 | 149702 | 6860 | 1504.2 |
| Standard (DFS Reference) | b1c3 | 110 | 3801 | 213 | 1513.5 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | c3d5 | 375 | 3288609 | 82244 | 12047.6 |
| + MVVLVA | c4d5 | 340 | 992776 | 28557 | 11965.6 |
| + TT | c4d5 | 340 | 982576 | 29393 | 3891.9 |
| + PST | c3d5 | 410 | 907532 | 26639 | 3880.0 |
| + Killers | c3d5 | 410 | 907532 | 26804 | 3523.3 |
| + History | c3d5 | 410 | 907095 | 27081 | 3547.0 |
| + RFP | c3d5 | 410 | 68591 | 7699 | 3547.0 |
| + FFP | c3d5 | 330 | 3629111 | 94379 | 16737.5 |
| + LMR | c3d5 | 330 | 2398282 | 66231 | 16522.3 |
| Standard (DFS Reference) | c3d5 | 410 | 4829 | 221 | 9444.6 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 445 | 9452763 | 241539 | 24939.9 |
| + MVVLVA | e2a6 | 445 | 7598801 | 193300 | 24731.5 |
| + TT | e2a6 | 445 | 7593235 | 198328 | 22986.1 |
| + PST | e2a6 | 445 | 7010164 | 166921 | 23426.0 |
| + Killers | e2a6 | 445 | 7011635 | 168187 | 23203.3 |
| + History | e2a6 | 445 | 7010815 | 169314 | 23419.8 |
| + RFP | e2a6 | 170 | 493386 | 17616 | 23227.9 |
| + FFP | e2a6 | 170 | 420911 | 16423 | 2821.7 |
| + LMR | e2a6 | 170 | 355845 | 14510 | 2763.3 |
| Standard (DFS Reference) | e2a6 | 375 | 7322 | 382 | 2759.2 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 110 | 716960 | 25210 | 8225.2 |
| ID (Exhaustive) | b4f4 | 110 | 766295 | 15120 | 7090.7 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 110 | 217111 | 7447 | 3342.5 |
| + MVVLVA | b4f4 | 110 | 264874 | 7651 | 1522.9 |
| + TT | b4f4 | 110 | 226736 | 7474 | 1522.9 |
| + PST | b4f4 | 110 | 171460 | 6554 | 1394.1 |
| + Killers | b4f4 | 110 | 180356 | 6795 | 1242.2 |
| + History | b4f4 | 110 | 180342 | 6962 | 1242.2 |
| + RFP | b4f4 | 110 | 137775 | 6274 | 1241.9 |
| + FFP | b4f4 | 110 | 113913 | 5959 | 1073.2 |
| + LMR | b4f4 | 110 | 35192 | 4204 | 1003.5 |
| Standard (DFS Reference) | b4f4 | 110 | 2827 | 72 | 650.5 |


Benchmark Complete.
