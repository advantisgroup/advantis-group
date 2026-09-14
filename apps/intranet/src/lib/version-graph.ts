export interface GraphNode {
  id: string;
  parentId: string | null;
  /** On the line that leads to what's in the form now. */
  highlighted: boolean;
}

export interface GraphLane {
  lane: number;
  highlighted: boolean;
}

export interface GraphRow {
  column: number;
  /** Lines coming in from the row above; `toNode` ones bend into this row's dot. */
  incoming: (GraphLane & { toNode: boolean })[];
  /** Lines leaving for the row below. */
  outgoing: GraphLane[];
}

/**
 * Lays a version tree out in lanes, newest row first, the way `git log
 * --graph` does: each line keeps its lane until it reaches its parent, a new
 * branch tip takes the first free lane, and lines that meet at a shared
 * parent bend into it.
 */
export function layoutGraph(nodes: GraphNode[]): { rows: GraphRow[]; lanes: number } {
  const open: ({ expects: string; highlighted: boolean } | null)[] = [];
  let width = 1;

  const rows = nodes.map((node) => {
    const incoming = open.flatMap((lane, i) =>
      lane ? [{ lane: i, highlighted: lane.highlighted, toNode: lane.expects === node.id }] : [],
    );
    let column = open.findIndex((lane) => lane?.expects === node.id);
    if (column === -1) column = open.findIndex((lane) => lane === null);
    if (column === -1) column = open.length;
    open.forEach((lane, i) => {
      if (lane?.expects === node.id) open[i] = null;
    });
    open[column] = node.parentId ? { expects: node.parentId, highlighted: node.highlighted } : null;
    while (open.length > 0 && open[open.length - 1] === null) open.pop();
    const outgoing = open.flatMap((lane, i) =>
      lane ? [{ lane: i, highlighted: lane.highlighted }] : [],
    );
    width = Math.max(width, column + 1, ...incoming.map((l) => l.lane + 1));
    return { column, incoming, outgoing };
  });

  return { rows, lanes: width };
}
