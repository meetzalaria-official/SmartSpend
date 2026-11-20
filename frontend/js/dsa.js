/* ==========================================================================
   SmartSpend · Phase 5 data structures and algorithms
   Small, readable implementations used by the finance screens:
   merge sort for transaction ordering, binary search for date lookups,
   a stack for undo, a queue for recurring transactions and a tree for
   category grouping. Exposed for the viva walkthrough.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = (window.SS = window.SS || {});

  function mergeSort(list, compare) {
    const source = Array.from(list || []);
    if (source.length <= 1) return source;
    const middle = Math.floor(source.length / 2);
    const left = mergeSort(source.slice(0, middle), compare);
    const right = mergeSort(source.slice(middle), compare);
    const merged = [];
    let leftIndex = 0;
    let rightIndex = 0;

    while (leftIndex < left.length && rightIndex < right.length) {
      if (compare(left[leftIndex], right[rightIndex]) <= 0) {
        merged.push(left[leftIndex]);
        leftIndex += 1;
      } else {
        merged.push(right[rightIndex]);
        rightIndex += 1;
      }
    }

    return merged.concat(left.slice(leftIndex), right.slice(rightIndex));
  }

  function quickSort(list, compare) {
    const source = Array.from(list || []);
    if (source.length <= 1) return source;
    const pivot = source[source.length - 1];
    const less = [];
    const equal = [];
    const greater = [];
    source.forEach((item) => {
      const result = compare(item, pivot);
      if (result < 0) less.push(item);
      else if (result > 0) greater.push(item);
      else equal.push(item);
    });
    return [...quickSort(less, compare), ...equal, ...quickSort(greater, compare)];
  }

  /* Binary search on a sorted array. `compare(item)` must return <0, 0 or >0
     for the target value. Returns the matching index or -1. */
  function binarySearch(sortedList, compare) {
    let low = 0;
    let high = sortedList.length - 1;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const result = compare(sortedList[middle]);
      if (result === 0) return middle;
      if (result < 0) low = middle + 1;
      else high = middle - 1;
    }

    return -1;
  }

  function linearSearch(list, predicate) {
    const source = list || [];
    for (let index = 0; index < source.length; index += 1) {
      if (predicate(source[index], index)) return index;
    }
    return -1;
  }

  class Stack {
    constructor(items) {
      this.items = Array.isArray(items) ? items.slice() : [];
    }

    push(value) {
      this.items.push(value);
      return this;
    }

    pop() {
      return this.items.pop();
    }

    peek() {
      return this.items[this.items.length - 1];
    }

    get size() {
      return this.items.length;
    }

    toArray() {
      return this.items.slice();
    }

    clear() {
      this.items = [];
    }
  }

  class Queue {
    constructor(items) {
      this.items = Array.isArray(items) ? items.slice() : [];
    }

    enqueue(value) {
      this.items.push(value);
      return this;
    }

    dequeue() {
      return this.items.shift();
    }

    peek() {
      return this.items[0];
    }

    get size() {
      return this.items.length;
    }

    toArray() {
      return this.items.slice();
    }

    clear() {
      this.items = [];
    }
  }

  /* ------------------------------------------------------------------------
     Category tree
     Categories are flat records in the API. The tree presents them as
     an expense/income hierarchy, which is what the settings and reports views
     visualise.
     ------------------------------------------------------------------------ */
  function buildCategoryTree(categories) {
    const list = categories || [];
    const root = { id: "root", name: "All categories", children: [] };
    const groups = {
      expense: { id: "group_expense", name: "Expenses", type: "group", children: [] },
      income: { id: "group_income", name: "Income", type: "group", children: [] },
    };

    list.forEach((category) => {
      const group = groups[category.type] || groups.expense;
      group.children.push({
        id: category.id,
        name: category.name,
        type: category.type,
        color: category.color,
        icon: category.icon,
        children: [],
      });
    });

    root.children = [groups.expense, groups.income];
    return root;
  }

  function flattenTree(node, depth) {
    if (!node) return [];
    const level = depth || 0;
    const lines = [{ id: node.id, name: node.name, type: node.type, depth: level, color: node.color, icon: node.icon }];
    (node.children || []).forEach((child) => {
      lines.push(...flattenTree(child, level + 1));
    });
    return lines;
  }

  function treeSize(node) {
    if (!node) return 0;
    return (node.children || []).reduce((total, child) => total + treeSize(child), 1);
  }

  /* ------------------------------------------------------------------------
     Finance-specific helpers
     ------------------------------------------------------------------------ */
  const SORTERS = {
    "date-desc": (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0),
    "date-asc": (a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0),
    "amount-desc": (a, b) => Number(b.amount) - Number(a.amount),
    "amount-asc": (a, b) => Number(a.amount) - Number(b.amount),
    description: (a, b) =>
      String(a.merchant || a.note || "").localeCompare(String(b.merchant || b.note || ""), "en", {
        sensitivity: "base",
      }),
  };

  function sortTransactions(transactions, key) {
    const sorter = SORTERS[key] || SORTERS["date-desc"];
    return mergeSort(transactions, sorter);
  }

  function searchTransactions(transactions, query) {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return transactions || [];
    return (transactions || []).filter((item) => {
      const haystack = [item.merchant, item.note, item.method, item.type]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

  function findTransactionByDate(sortedTransactions, isoDate) {
    if (!isoDate) return null;
    const index = binarySearch(sortedTransactions, (transaction) => {
      if (transaction.date < isoDate) return -1;
      if (transaction.date > isoDate) return 1;
      return 0;
    });
    return index >= 0 ? sortedTransactions[index] : null;
  }

  SS.dsa = {
    mergeSort,
    quickSort,
    binarySearch,
    linearSearch,
    Stack,
    Queue,
    buildCategoryTree,
    flattenTree,
    treeSize,
    sortTransactions,
    searchTransactions,
    findTransactionByDate,
    SORTERS,
  };
})(window);
