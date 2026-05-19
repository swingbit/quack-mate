Precomputed tables initialized.
Starting Benchmark at Depth 5 with 1 Threads (Batch Size: 8)...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | d2d4 | 110 | 5071234 | 184870 | 50540.9 |
| ID (Exhaustive) | d2d4 | 110 | 5287598 | 74648 | 49438.8 |
| BPVS (ID + AB + LMP + Batches) | d2d4 | 110 | 899277 | 18776 | 12292.3 |
| + MVVLVA | d2d4 | 110 | 899277 | 18463 | 4188.3 |
| + TT | d2d4 | 110 | 834336 | 17559 | 4183.8 |
| + PST | d2d4 | 110 | 752795 | 14691 | 3914.0 |
| + Killers | d2d4 | 110 | 752801 | 14759 | 3587.5 |
| + History | d2d4 | 110 | 752751 | 14991 | 3628.2 |
| + RFP | e2e4 | 110 | 713003 | 15704 | 3628.2 |
| + FFP | d2d4 | 110 | 234464 | 8013 | 3268.0 |
| + LMR | d2d4 | 110 | 234176 | 7567 | 1891.0 |
| Standard (DFS Reference) | b1c3 | 110 | 3801 | 206 | 1872.2 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | c3d5 | 340 | 4106440 | 99920 | 14613.6 |
| + MVVLVA | c3d5 | 340 | 1797889 | 45432 | 14586.1 |
| + TT | c3d5 | 410 | 1868947 | 47549 | 7678.0 |
| + PST | c3d5 | 410 | 1648014 | 41413 | 7678.0 |
| + Killers | c3d5 | 410 | 1645431 | 41503 | 6984.1 |
| + History | c3d5 | 410 | 1645427 | 42210 | 7108.4 |
| + RFP | c3d5 | 410 | 222741 | 11512 | 7108.4 |
| + FFP | c3d5 | 330 | 3669511 | 95897 | 16846.0 |
| + LMR | c3d5 | 330 | 2441397 | 66856 | 16725.5 |
| Standard (DFS Reference) | c3d5 | 410 | 4829 | 217 | 9449.1 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 445 | 9730216 | 248623 | 24938.8 |
| + MVVLVA | e2a6 | 445 | 7730337 | 192980 | 24634.7 |
| + TT | e2a6 | 445 | 7704578 | 197650 | 23349.6 |
| + PST | e2a6 | 445 | 7136856 | 169144 | 23327.1 |
| + Killers | e2a6 | 445 | 7135107 | 170456 | 23058.4 |
| + History | e2a6 | 445 | 7134213 | 171946 | 23000.4 |
| + RFP | e2a6 | 170 | 499865 | 17072 | 22808.4 |
| + FFP | e2a6 | 170 | 425820 | 15791 | 3130.0 |
| + LMR | e2a6 | 170 | 360606 | 14130 | 3002.0 |
| Standard (DFS Reference) | e2a6 | 375 | 7322 | 351 | 2398.0 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 110 | 716960 | 25421 | 8232.2 |
| ID (Exhaustive) | b4f4 | 110 | 766295 | 14074 | 7103.7 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 110 | 274624 | 7550 | 3294.0 |
| + MVVLVA | b4f4 | 110 | 211478 | 6517 | 1566.4 |
| + TT | b4f4 | 110 | 298216 | 7739 | 1624.8 |
| + PST | b4f4 | 110 | 228241 | 7009 | 1624.8 |
| + Killers | b4f4 | 110 | 234630 | 6990 | 1331.7 |
| + History | b4f4 | 110 | 234702 | 7107 | 1348.7 |
| + RFP | b4f4 | 110 | 177325 | 6365 | 1348.7 |
| + FFP | b4f4 | 110 | 158806 | 6120 | 1169.3 |
| + LMR | b4f4 | 110 | 80061 | 4326 | 1158.1 |
| Standard (DFS Reference) | b4f4 | 110 | 2827 | 70 | 832.1 |


Benchmark Complete.
