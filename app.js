const itemsBody = document.querySelector("#items");
const currencySelect = document.querySelector("#currency");
const projectNameInput = document.querySelector("#projectName");

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function money(value) {
  const currency = currencySelect.value;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function addRow(description = "", unit = "m²", quantity = "", rate = "") {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><input aria-label="Item description" class="description" type="text" placeholder="e.g. Concrete works"></td>
    <td><input aria-label="Unit" class="unit" type="text" placeholder="m³"></td>
    <td><input aria-label="Quantity" class="quantity" type="number" min="0" step="any" placeholder="0"></td>
    <td><input aria-label="Unit rate" class="rate" type="number" min="0" step="any" placeholder="0.00"></td>
    <td class="amount">—</td>
    <td><button class="remove" type="button" aria-label="Remove item" title="Remove item">×</button></td>`;
  row.querySelector(".description").value = description;
  row.querySelector(".unit").value = unit;
  row.querySelector(".quantity").value = quantity;
  row.querySelector(".rate").value = rate;
  row.querySelectorAll("input").forEach(input => input.addEventListener("input", updateTotals));
  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
    updateTotals();
  });
  itemsBody.appendChild(row);
  updateTotals();
}

function getRows() {
  return [...itemsBody.querySelectorAll("tr")].map(row => {
    const description = row.querySelector(".description").value.trim();
    const unit = row.querySelector(".unit").value.trim();
    const quantity = numberValue(row.querySelector(".quantity").value);
    const rate = numberValue(row.querySelector(".rate").value);
    return { description, unit, quantity, rate, total: quantity * rate, row };
  });
}

function updateTotals() {
  const rows = getRows();
  let grandTotal = 0;
  rows.forEach(item => {
    item.row.querySelector(".amount").textContent = money(item.total);
    grandTotal += item.total;
  });
  document.querySelector("#itemCount").textContent = rows.length;
  document.querySelector("#grandTotal").textContent = money(grandTotal);
}

function exportCsv() {
  const rows = getRows();
  const currency = currencySelect.value;
  const project = projectNameInput.value.trim() || "Untitled estimate";
  const data = [
    ["Project", project],
    ["Currency", currency],
    [],
    ["Description", "Unit", "Quantity", "Unit Rate", "Total", "Currency"],
    ...rows.map(({description, unit, quantity, rate, total}) =>
      [description, unit, quantity, rate, total.toFixed(2), currency])
  ];
  const csv = data.map(row => row.map(value => {
    const cell = String(value ?? "");
    return `"${cell.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], {type: "text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "estimate"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

document.querySelector("#addRow").addEventListener("click", () => addRow());
document.querySelector("#exportCsv").addEventListener("click", exportCsv);
document.querySelector("#clearAll").addEventListener("click", () => {
  if (confirm("Clear all BOQ items and start a new estimate?")) {
    itemsBody.replaceChildren();
    projectNameInput.value = "";
    addRow();
  }
});
currencySelect.addEventListener("change", updateTotals);

addRow("Excavation", "m³", 100, 250);
addRow("Reinforced concrete", "m³", 35, 4200);
