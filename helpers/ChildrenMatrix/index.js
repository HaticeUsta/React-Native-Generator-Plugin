const { getTupleChildrenCount, getColumnNodes } = require("./helpers");

/**
 * constructor function that gets children array of a container node
 * and builds a matrix in which children are layed based on their coordinates
 * this matrix helps aligning children using the flexbox algorithm
 *
 * This technique is based on 3 simple assumptions:
 * - nodes with close x values are more likely to exist in the same column
 * - nodes with close y values are more likely to exist in the same row
 * - nodes close to the very top left are aligned first
 *
 * Terms
 * - slot => an object {i, j} such that i is the first index and j is the second index of an item within the matrix
 * - child => an instance of Scenenode
 * - matrix =>  a 2D array. For n items we create a 2D array of n rows each row with n items
 *
 * @param {*} children an array of nodes that exists within the bounds of a container node
 * @returns an instance of ChildrenMatrix
 */
function ChildrenMatrix(children) {
  if (!Array.isArray(children) || children.length === 0) {
    throw new Error(
      "invalid children passed to ChildrenMatrix constructor function. Should be an array of at least one child"
    );
  }

  this.children = children;
  this.n = children.length;

  // initiate a 2D array with falsy values until being populated with children
  this.matrix = new Array(this.n)
    .fill(null)
    .map(_ => new Array(this.n).fill(null));
}

/**
 * sets a child node in a given empty slot
 * @param slot
 * @param child
 * @returns nothing
 */
ChildrenMatrix.prototype.setChild = function({ i, j }, child) {
  this.matrix[i][j] = child;
};

/**
 * gets the slots that contain children nodes within the same row of the given empty slot
 * @param slot
 * @returns an array of nodes
 */
ChildrenMatrix.prototype.getSlotRowNeighbors = function({ i, j }) {
  return this.matrix[i].filter((item, index) => index !== j && item);
};

/**
 * gets the slots that contain children nodes within the same column of the given empty slot
 * @param slot
 * @returns an array of nodes
 */
ChildrenMatrix.prototype.getSlotColumnNeighbors = function({ i, j }) {
  return this.matrix.reduce((acc, tuple, index) => {
    return index !== i && tuple[j] ? acc.concat(tuple[j]) : acc;
  }, []);
};

/**
 * sorts the children array such that nodes at the very top left comes first
 * @returns nothing
 */
ChildrenMatrix.prototype.sortChildren = function() {
  const childrenDiameter = this.children.map(child => {
    const diameter = Math.sqrt(
      Math.pow(child.boundsInParent.x, 2) + Math.pow(child.boundsInParent.y, 2)
    );

    return { child, diameter };
  });

  // sort the childrenDiameter array based on diameter
  childrenDiameter.sort((a, b) => a.diameter - b.diameter);

  this.children = childrenDiameter.map(item => item.child);
};

/**
 * calculates the likelihood that a new child node should be layed in a given slot relative to a set of possible slots
 * @param slot
 * @param newChild
 * @returns the likelihood value
 */
ChildrenMatrix.prototype.calculateSlotChildMetric = function(slot, newChild) {
  let metric = 0;

  const rowNeighbors = this.getSlotRowNeighbors(slot);

  const columnNeighbors = this.getSlotColumnNeighbors(slot);

  rowNeighbors.forEach(rowNeighbor => {
    metric += Math.abs(
      newChild.boundsInParent.y - rowNeighbor.boundsInParent.y
    );
  });

  columnNeighbors.forEach(columnNeighbor => {
    metric += Math.abs(
      newChild.boundsInParent.x - columnNeighbor.boundsInParent.x
    );
  });

  return metric;
  // return metric < proposedMetric ? metric : proposedMetric;
};

/**
 * gets the empty slots that a new child node can be layed in
 * based on the number and positions of the children that are currently being in the matrix
 * @returns an array of ampty slots
 */
ChildrenMatrix.prototype.getPossibleSlots = function() {
  let containsAtLeastOneChild = false;
  const possibleSlots = [];

  this.matrix.forEach((tuple, rowIndex) => {
    tuple.forEach((slot, columnIndex) => {
      if (slot) {
        containsAtLeastOneChild = true;
        // slot contains a node so check its neighbours
        if (
          rowIndex + 1 > 0 &&
          rowIndex + 1 < this.n &&
          !this.matrix[rowIndex + 1][columnIndex]
        ) {
          possibleSlots.push({ i: rowIndex + 1, j: columnIndex });
        }

        if (
          columnIndex + 1 > 0 &&
          columnIndex + 1 < this.n &&
          !this.matrix[rowIndex][columnIndex + 1]
        ) {
          possibleSlots.push({ i: rowIndex, j: columnIndex + 1 });
        }
      }
    });
  });

  if (!containsAtLeastOneChild) {
    return [{ i: 0, j: 0 }];
  }

  // remove duplicates before return
  return possibleSlots.reduce((acc, v) => {
    const itemAddedBefore = acc.find(item => item.i === v.i && item.j === v.j);

    if (!itemAddedBefore) {
      return acc.concat(v);
    }

    return acc;
  }, []);
};

/**
 * gets the most suitable empty slot in which a new child should be layed in
 * @param newChild
 * @returns an empty slot
 */
ChildrenMatrix.prototype.getMostSuitableSlot = function(newChild) {
  const possibleSlots = this.getPossibleSlots();

  const slotsMetrics = [];

  // evaluate slots
  possibleSlots.forEach(slot => {
    const metric = this.calculateSlotChildMetric(slot, newChild);

    slotsMetrics.push({ slot, metric });
  });

  const leastMetricSlot = slotsMetrics.reduce((acc, v) => {
    if (v.metric < acc.metric) {
      return v;
    }

    return acc;
  }, slotsMetrics[0]);

  return leastMetricSlot.slot;
};

/**
 * determines the nodes that should be duplicated in multiple slots when the row of node structure is not enough
 * @returns an array of nodes
 */
ChildrenMatrix.prototype.getNodesToBeDuplicated = function() {
  const toBeDuplicatedNodes = [];

  this.matrix.forEach((tuple, i) => {
    tuple.forEach((node, j) => {
      if (
        node && // not empty slot
        this.matrix[i + 1] && // not last tuple in the matrix
        getTupleChildrenCount(this.matrix[i + 1]) && // next tuple has nodes
        !this.matrix[i + 1][j] && // the bottom neighbor is an empty slot
        // check if any node in the next row lies within the height of this node
        this.getSlotRowNeighbors({ i: i + 1, j }).find(
          item =>
            item.boundsInParent.y >= node.boundsInParent.y &&
            item.boundsInParent.y <=
              node.boundsInParent.y + node.boundsInParent.height
        )
      ) {
        toBeDuplicatedNodes.push({ node, slot: { i, j } });
      }
    });
  });

  return toBeDuplicatedNodes;
};

ChildrenMatrix.prototype.checkTheCase = function() {
  for (let j = 0; j < this.n; j++) {
    const columnNodes = getColumnNodes(this.matrix, j);

    const nodeIndex = columnNodes.findIndex(
      (node, index) =>
        index < columnNodes.length - 1 && // it is not the last node in the array
        node.guid === columnNodes[index + 1].guid // it occupies the next node
    );

    if (nodeIndex !== -1) {
      return { i: nodeIndex, j };
    }
  }

  return null;
};

ChildrenMatrix.prototype.getToBeMergedRowsCount = function(targetSlot) {
  const columnNodes = getColumnNodes(this.matrix, targetSlot.j);

  return columnNodes
    .slice(targetSlot.i)
    .reduce((acc, node, index, slicedArray) => {
      if (
        index < slicedArray.length - 1 &&
        node.guid === slicedArray[index + 1].guid
      ) {
        return acc + 1;
      }

      return acc;
    }, 1);
};

ChildrenMatrix.prototype.rearrangeMatrix = function(
  targetSlot,
  toBeMergedRowsCount
) {
  const toBeMergedRows = [targetSlot.i];

  for (let iterator = 1; iterator < toBeMergedRowsCount; iterator++) {
    toBeMergedRows.push(iterator + toBeMergedRows[0]);
  }

  let childrenCount = 1; // for the items to be merged

  // rows not affected with the merge
  this.matrix.forEach((row, rowIndex) => {
    if (!toBeMergedRows.includes(rowIndex)) {
      childrenCount += getTupleChildrenCount(row);
    }
  });

  // items to be merged left & right adjacents
  let therIsLeft = false;
  let thereIsRight = false;

  this.matrix.forEach((tuple, i) => {
    tuple.forEach((node, j) => {
      if (node && toBeMergedRows.includes(i)) {
        if (j > targetSlot.j) {
          thereIsRight = true;
        } else if (j < targetSlot.j) {
          therIsLeft = true;
        }
      }
    });
  });

  if (therIsLeft) {
    childrenCount += 1;
  }

  if (thereIsRight) {
    childrenCount += 1;
  }

  const children = new Array(childrenCount);

  children.fill({});

  const newChildrenMatrix = new ChildrenMatrix(children);

  // set not affected nodes
  this.matrix.forEach((tuple, i) => {
    if (!toBeMergedRows.includes(i)) {
      tuple.forEach((node, j) => {
        if (node) {
          if (i > targetSlot.i + toBeMergedRowsCount - 1) {
            newChildrenMatrix.setChild(
              { i: i - toBeMergedRowsCount + 1, j },
              node
            );
          } else {
            newChildrenMatrix.setChild({ i, j }, node);
          }
        }
      });
    }
  });

  // set targetSlot and its subsequents in the slot {i: targetSlot.i, j: 1}
  newChildrenMatrix.setChild(
    { i: targetSlot.i, j: therIsLeft ? 1 : 0 },
    this.matrix[targetSlot.i][targetSlot.j]
  );

  // set its left in the slot {i: targetSlot.i, j: 0}
  if (therIsLeft) {
    const leftNodes = [];

    this.matrix.forEach((tuple, i) => {
      if (toBeMergedRows.includes(i)) {
        tuple.forEach((node, j) => {
          if (node && j < targetSlot.j) {
            leftNodes.push({ node, slot: { i, j } });
          }
        });
      }
    });

    const targetSlotLeftCMatrixChildren = new Array(leftNodes.length);
    targetSlotLeftCMatrixChildren.fill({});

    const targetSlotLeftCMatrix = new ChildrenMatrix(
      targetSlotLeftCMatrixChildren
    );

    leftNodes.forEach(({ node, slot }) => {
      targetSlotLeftCMatrix.setChild(
        { i: slot.i - targetSlot.i, j: slot.j },
        node
      );
    });

    newChildrenMatrix.setChild(
      { i: targetSlot.i, j: 0 },
      targetSlotLeftCMatrix
    );
  }

  // set its right in the slot {i: targetSlot.i, j: 2}
  if (thereIsRight) {
    const rightNodes = [];

    this.matrix.forEach((tuple, i) => {
      if (toBeMergedRows.includes(i)) {
        tuple.forEach((node, j) => {
          if (node && j > targetSlot.j) {
            rightNodes.push({ node, slot: { i, j } });
          }
        });
      }
    });

    const targetSlotRightCMatrixChildren = new Array(rightNodes.length);
    targetSlotRightCMatrixChildren.fill({});

    const targetSlotRightCMatrix = new ChildrenMatrix(
      targetSlotRightCMatrixChildren
    );

    rightNodes.forEach(({ node, slot }) => {
      targetSlotRightCMatrix.setChild(
        { i: slot.i - targetSlot.i, j: slot.j - targetSlot.j - 1 },
        node
      );
    });

    newChildrenMatrix.setChild(
      { i: targetSlot.i, j: therIsLeft ? 2 : 1 },
      targetSlotRightCMatrix
    );
  }

  this.n = newChildrenMatrix.n;
  this.children = newChildrenMatrix.children;
  this.matrix = newChildrenMatrix.matrix;
};

/**
 * lays the children nodes in the matrix
 * @returns the matrix after laying the children in
 */
ChildrenMatrix.prototype.layChildrenInsideMatrix = function() {
  this.sortChildren();

  this.children.forEach(child => {
    const suitableSlot = this.getMostSuitableSlot(child);

    this.setChild(suitableSlot, child);
  });

  let toBeDuplicatedNodes = this.getNodesToBeDuplicated();

  while (toBeDuplicatedNodes.length) {
    toBeDuplicatedNodes.forEach(({ node, slot }) => {
      this.setChild({ i: slot.i + 1, j: slot.j }, node);
    });

    toBeDuplicatedNodes = this.getNodesToBeDuplicated();
  }

  let tSlot = this.checkTheCase();
  while (tSlot) {
    const toBeMergedRowsCount = this.getToBeMergedRowsCount(tSlot);

    this.rearrangeMatrix(tSlot, toBeMergedRowsCount);

    tSlot = this.checkTheCase();
  }

  return this.matrix;
};

module.exports = {
  ChildrenMatrix
};
