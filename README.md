# Satisplanner

Planejador de Satisfactory. A partir de uma ou mais metas em itens por minuto, o quadro mostra as máquinas e como ligá-las com divisores, mescladores e junções de cano. Itens em comum usam o mesmo grupo de máquinas.

## Uso

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

- **Manifold**: tronco com um divisor por máquina; a máquina puxa a taxa dela e o resto segue.
- **Balanceador**: árvore de divisores de 2 ou 3 saídas iguais. Saídas que sobram recirculam. Fluidos continuam em junção de cano.
- Clique numa máquina para trocar a receita, o clock ou os somersloops daquele item.
- A Mk de cada esteira ou cano é a menor que carrega a taxa, limitada pelo que está desbloqueado.

Os nomes dos itens vêm em inglês do conjunto de dados do Satisfactory Calculator (jogo 1.0, incluindo fluidos, subprodutos, alternativas, overclock e somersloop). Para regenerar `lib/data/game-data.json`:

```bash
npm run data:normalize
```
