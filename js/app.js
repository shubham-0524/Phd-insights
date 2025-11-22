

const fileInput = document.getElementById("file-input");
const domainFilter = document.getElementById("domain-filter");
const statusFilter = document.getElementById("status-filter");
const facultyFilter = document.getElementById("faculty-filter");

const totalProjectsEl = document.getElementById("total-projects");
const totalFundingEl = document.getElementById("total-funding");
const uniqueDomainsEl = document.getElementById("unique-domains");
const statusBreakdownEl = document.getElementById("status-breakdown");

const tableBody = document.querySelector("#projects-table tbody");

let allRows = [];
let charts = {
  projectsByDomain: null,
  fundingByDomain: null,
  projectsByStatus: null,
};

fileInput.addEventListener("change", handleFileUpload);
[domainFilter, statusFilter, facultyFilter].forEach((el) => {
  el.addEventListener("change", () => render(allRows));
});

function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

    allRows = json.map((row) => normalizeRow(row));
    populateFilterOptions(allRows);
    render(allRows);
  };
  reader.readAsArrayBuffer(file);
}

function normalizeRow(row) {
  return {
    Domain: String(row["Domain"] || "").trim(),
    ProjectType: String(row["Project Type"] || "").trim(),
    Title: String(row["Title"] || "").trim(),
    FundingAgency: String(row["Funding Agency"] || "").trim(),
    Amount: parseFloat(String(row["Amount(in lakhs)"] || "0").toString().replace(/,/g, "")) || 0,
    Status: String(row["Status"] || "").trim(),
    FacultyName: String(row["Faculty Name"] || "").trim(),
  };
}

function applyFilters(rows) {
  const domain = domainFilter.value;
  const status = statusFilter.value;
  const faculty = facultyFilter.value;

  return rows.filter((r) => {
    const domainOk = !domain || r.Domain === domain;
    const statusOk = !status || r.Status === status;
    const facultyOk = !faculty || r.FacultyName === faculty;
    return domainOk && statusOk && facultyOk;
  });
}

function populateFilterOptions(rows) {
  const domains = new Set();
  const statuses = new Set();
  const faculties = new Set();

  rows.forEach((r) => {
    if (r.Domain) domains.add(r.Domain);
    if (r.Status) statuses.add(r.Status);
    if (r.FacultyName) faculties.add(r.FacultyName);
  });

  fillSelect(domainFilter, domains);
  fillSelect(statusFilter, statuses);
  fillSelect(facultyFilter, faculties);
}

function fillSelect(selectEl, values) {
  const current = selectEl.value;
  selectEl.innerHTML = "";

  const allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = "All";
  selectEl.appendChild(allOpt);

  Array.from(values)
    .sort((a, b) => a.localeCompare(b))
    .forEach((value) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      selectEl.appendChild(opt);
    });

  // try to preserve previous selection if still valid
  if (current && Array.from(values).includes(current)) {
    selectEl.value = current;
  }
}

function render(rows) {
  if (!rows || !rows.length) {
    clearSummary();
    clearTable();
    clearCharts();
    return;
  }

  const filtered = applyFilters(rows);
  updateSummary(filtered);
  renderTable(filtered);
  renderCharts(filtered);
}

function clearSummary() {
  totalProjectsEl.textContent = "-";
  totalFundingEl.textContent = "-";
  uniqueDomainsEl.textContent = "-";
  statusBreakdownEl.textContent = "-";
}

function updateSummary(rows) {
  const totalProjects = rows.length;
  const totalFunding = rows.reduce((sum, r) => sum + (r.Amount || 0), 0);
  const uniqueDomains = new Set(rows.map((r) => r.Domain).filter(Boolean)).size;

  const statusCounts = rows.reduce((acc, r) => {
    const key = r.Status || "Unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  totalProjectsEl.textContent = totalProjects.toString();
  totalFundingEl.textContent = totalFunding.toFixed(2);
  uniqueDomainsEl.textContent = uniqueDomains.toString();
  statusBreakdownEl.textContent = Object.entries(statusCounts)
    .map(([status, count]) => `${status}: ${count}`)
    .join(" | ");
}

function clearTable() {
  tableBody.innerHTML = "";
}

function renderTable(rows) {
  clearTable();
  const frag = document.createDocumentFragment();

  rows.forEach((r) => {
    const tr = document.createElement("tr");

    const cells = [
      r.Domain,
      r.ProjectType,
      r.Title,
      r.FundingAgency,
      r.Amount?.toFixed(2) ?? "0.00",
      r.Status,
      r.FacultyName,
    ];

    cells.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });

    frag.appendChild(tr);
  });

  tableBody.appendChild(frag);
}

function clearCharts() {
  Object.keys(charts).forEach((key) => {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  });
}

function renderCharts(rows) {
  clearCharts();

  const byDomain = aggregateBy(rows, (r) => r.Domain || "Unknown");
  const fundingByDomain = aggregateBy(rows, (r) => r.Domain || "Unknown", (r) => r.Amount || 0);
  const byStatus = aggregateBy(rows, (r) => r.Status || "Unknown");

  const domainLabels = Object.keys(byDomain);
  const domainCounts = domainLabels.map((d) => byDomain[d]);
  const domainFunding = domainLabels.map((d) => fundingByDomain[d] ?? 0);

  const statusLabels = Object.keys(byStatus);
  const statusCounts = statusLabels.map((s) => byStatus[s]);

  const palette = [
    "#f97316",
    "#22c55e",
    "#3b82f6",
    "#eab308",
    "#a855f7",
    "#ec4899",
    "#06b6d4",
    "#f97373",
  ];

  // Projects by domain (bar)
  charts.projectsByDomain = new Chart(
    document.getElementById("projects-by-domain"),
    {
      type: "bar",
      data: {
        labels: domainLabels,
        datasets: [
          {
            label: "Projects",
            data: domainCounts,
            backgroundColor: domainLabels.map((_, i) => palette[i % palette.length]),
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
        },
        responsive: true,
        scales: {
          x: { ticks: { color: "#9ca3af" } },
          y: { ticks: { color: "#9ca3af" }, beginAtZero: true },
        },
      },
    }
  );

  // Funding by domain (bar)
  charts.fundingByDomain = new Chart(
    document.getElementById("funding-by-domain"),
    {
      type: "bar",
      data: {
        labels: domainLabels,
        datasets: [
          {
            label: "Funding (Lakhs)",
            data: domainFunding,
            backgroundColor: domainLabels.map((_, i) => palette[(i + 2) % palette.length]),
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
        },
        responsive: true,
        scales: {
          x: { ticks: { color: "#9ca3af" } },
          y: { ticks: { color: "#9ca3af" }, beginAtZero: true },
        },
      },
    }
  );

  // Projects by status (pie)
  charts.projectsByStatus = new Chart(
    document.getElementById("projects-by-status"),
    {
      type: "pie",
      data: {
        labels: statusLabels,
        datasets: [
          {
            data: statusCounts,
            backgroundColor: statusLabels.map((_, i) => palette[i % palette.length]),
          },
        ],
      },
      options: {
        plugins: {
          legend: {
            labels: {
              color: "#e5e7eb",
            },
          },
        },
        responsive: true,
      },
    }
  );
}

function aggregateBy(rows, keyFn, valueFn) {
  const acc = {};
  rows.forEach((r) => {
    const key = keyFn(r) || "Unknown";
    const value = valueFn ? valueFn(r) : 1;
    acc[key] = (acc[key] || 0) + value;
  });
  return acc;
}
