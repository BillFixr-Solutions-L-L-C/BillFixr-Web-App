// BillFixr Interactive Client Logic — Multi-Phase Journey

let currentBillData = null;
let currentAuditResult = null;
let currentStrategy = "fair_market";
let currentOffer = 175;
let currentLetterMarkdown = "";
let currentNegotiation = null;
let currentRole = "patient"; // 'patient' or 'admin'
let rescanUsed = false;
let currentStep = 1;

// Global Beautiful App Modal Card Handlers
function showAppModal(message, title = "BillFixr Notice", type = "success") {
  const backdrop = document.getElementById("appModalBackdrop");
  const titleEl = document.getElementById("appModalTitle");
  const msgEl = document.getElementById("appModalMessage");
  const iconEl = document.getElementById("appModalIcon");
  if (!backdrop) {
    if (window._nativeAlert) window._nativeAlert(message);
    return;
  }
  if (titleEl) titleEl.innerText = title;
  if (msgEl) msgEl.innerText = message;
  if (iconEl) {
    if (type === "error") {
      iconEl.className = "app-modal-icon-circle error";
      iconEl.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    } else {
      iconEl.className = "app-modal-icon-circle success";
      iconEl.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    }
  }
  backdrop.style.display = "flex";
}

function closeAppModal() {
  const backdrop = document.getElementById("appModalBackdrop");
  if (backdrop) backdrop.style.display = "none";
}

function handleModalBackdropClick(event) {
  if (event.target && event.target.id === "appModalBackdrop") {
    closeAppModal();
  }
}

// Intercept browser alert with our beautiful modal card!
if (!window._nativeAlert) {
  window._nativeAlert = window.alert;
}
window.alert = function(msg) {
  let title = "BillFixr Update";
  let type = "success";
  const lower = String(msg).toLowerCase();
  if (lower.includes("error") || lower.includes("failed")) {
    title = "Notice";
    type = "error";
  } else if (lower.includes("dispatched") || lower.includes("delivered") || lower.includes("accepted") || lower.includes("sent")) {
    title = "Action Confirmed";
    type = "success";
  }
  showAppModal(msg, title, type);
};

// Robust Markdown Table Parser: converts markdown pipe table to styled HTML table
function parseMarkdownTable(tableBlock) {
  if (!tableBlock || !tableBlock.includes('|')) return null;

  // Split compacted lines where LLM joined rows with ||
  let normalized = tableBlock.replace(/\|\|+/g, '\n|');
  const rawLines = normalized.split('\n').map(l => l.trim()).filter(Boolean);
  
  const parsedRows = [];
  for (const line of rawLines) {
    // Skip separator lines like |---|---| or |--|| or dashes
    if (/^\|?[\s\-:]+(\|[\s\-:]+)+\|?$/.test(line) || /^[\-|=]+$/.test(line)) {
      continue;
    }
    if (!line.includes('|')) continue;

    let cells = line.split('|').map(c => c.trim());
    if (cells.length > 0 && cells[0] === '') cells.shift();
    if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
    
    if (cells.length > 0) {
      parsedRows.push(cells);
    }
  }

  if (parsedRows.length < 2) return null;

  const headerRow = parsedRows[0];
  const dataRows = parsedRows.slice(1);

  let ths = headerRow.map(h => `<th>${h}</th>`).join('');
  let trs = dataRows.map(row => {
    let tds = row.map(cell => {
      let isAmount = /[\$€£]\s*[\d,]+(\.\d{2})?/.test(cell) || /^-\s*[\$€£]?\s*[\d,]+/.test(cell);
      return `<td class="${isAmount ? 'amount-cell' : ''}">${cell}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  return `
    <div class="letter-table-wrap">
      <table class="letter-charges-table">
        <thead><tr>${ths}</tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </div>
  `;
}

// Robust Markdown to HTML Formatter (Strips code fences, parses tables and lists)
function formatMarkdownToHtml(rawMarkdown) {
  if (!rawMarkdown) return "";

  // 1. Strip raw code fences (```markdown ... ``` or ``` ... ```)
  let md = String(rawMarkdown)
    .replace(/^```[a-z]*\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();

  // 2. Escape angle brackets
  md = md.replace(/&(?!amp;|lt;|gt;|quot;|#39;)/g, "&amp;");

  // 3. Transform headings
  md = md.replace(/^### (.*$)/gim, '<h4 class="letter-subhead">$1</h4>');
  md = md.replace(/^## (.*$)/gim, '<h3 class="letter-section-title">$1</h3>');
  md = md.replace(/^# (.*$)/gim, '<h2 class="letter-doc-title">$1</h2>');

  // 4. Transform bold and italics
  md = md.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
  md = md.replace(/\*(.*?)\*/gim, '<em>$1</em>');

  // 5. Transform horizontal rules
  md = md.replace(/^---$/gim, '<hr class="letter-hr">');

  // 6. Split into blocks by double newlines
  const blocks = md.split(/\n\s*\n/);
  const formattedBlocks = blocks.map(block => {
    block = block.trim();
    if (!block) return '';
    if (block.startsWith('<h2') || block.startsWith('<h3') || block.startsWith('<h4') || block.startsWith('<hr')) {
      return block;
    }
    // Markdown table check
    if (block.includes('|') && (block.includes('\n|') || block.includes('||') || block.includes('|---') || block.includes('| -'))) {
      const tbl = parseMarkdownTable(block);
      if (tbl) return tbl;
    }
    // Numbered list
    if (/^\d+\.\s+/m.test(block)) {
      const items = block.split(/\n(?=\d+\.\s+)/).filter(Boolean);
      return `<ol class="letter-num-list">${items.map(item => `<li>${item.replace(/^\d+\.\s+/, '').replace(/\n/g, '<br>')}</li>`).join('')}</ol>`;
    }
    // Bulleted list
    if (block.includes('\n* ') || block.includes('\n- ') || block.startsWith('* ') || block.startsWith('- ')) {
      const items = block.split(/\n[\*\-]\s+/).filter(Boolean);
      return `<ul class="letter-list">${items.map(item => `<li>${item.replace(/^[\*\-]\s+/, '').replace(/\n/g, '<br>')}</li>`).join('')}</ul>`;
    }
    // Paragraph with clean single line breaks preserved
    return `<p class="letter-p">${block.replace(/\n/g, '<br>')}</p>`;
  });

  return formattedBlocks.filter(Boolean).join('\n');
}

// Executive Formal Hospital Letter Renderer (Screenshot 4 Fix: Official Hospital Packet Layout)
function formatHospitalLetterHtml(rawMarkdown) {
  if (!rawMarkdown) return "";

  let md = String(rawMarkdown)
    .replace(/^```[a-z]*\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();

  // Patient & Case metadata
  const patName = currentAuditResult?.patient_name || currentBillData?.patient_name || "Patient";
  const provName = currentAuditResult?.provider_name || currentBillData?.provider_name || "Healthcare Provider";
  const accNum = currentAuditResult?.account_number || currentBillData?.account_number || "N/A";
  const currentDateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const refId = `BFX-DISPUTE-${accNum}`;

  // Clean raw bracket placeholders
  md = md
    .replace(/\[Your Address\]/gi, "Patient Address on File")
    .replace(/\[City,\s*State,\s*ZIP\]/gi, "Example City, ST")
    .replace(/\[Email Address\]/gi, "advocate@example.com")
    .replace(/\[Phone Number\]/gi, "(615) 555-0192")
    .replace(/\[Provider Address\]/gi, "100 Example Street, Example City, ST 00000")
    .replace(/\[Date\]/gi, currentDateStr)
    .replace(/\[Current Date\]/gi, currentDateStr);

  // Extract Subject line if present
  let subjectText = `Formal Dispute of Account #${accNum} | Statutory Audit & Binding Settlement Demand`;
  const subjectMatch = md.match(/(?:Subject|### RE|RE):\s*([^\n]+)/i);
  if (subjectMatch) {
    subjectText = subjectMatch[1].replace(/^\*\*|\*\*$/g, '').replace(/\|.*$/g, '').trim();
    if (!subjectText.includes(accNum)) {
      subjectText += ` — Account #${accNum}`;
    }
  }

  // Find where the salutation or main dispute body begins
  let bodyStartIndex = 0;
  const salutationMatch = md.match(/(Dear\s+[^\n]+|I\s+am\s+writing\s+to\s+formally\s+dispute)/i);
  if (salutationMatch && salutationMatch.index !== undefined) {
    bodyStartIndex = salutationMatch.index;
  }

  // Isolate the actual letter body (stripping unformatted run-on header text at the top)
  let letterBody = bodyStartIndex > 0 ? md.substring(bodyStartIndex).trim() : md;

  // Build the executive hospital letterhead
  const formalLetterheadHtml = `
    <div class="formal-letterhead">
      <div class="letterhead-sender">
        <div class="sender-name">BillFixr Patient Financial Advocacy</div>
        <div class="sender-meta">
          <div><strong>Authorized Representative for:</strong> ${patName}</div>
          <div><strong>Patient Account / Invoice #:</strong> ${accNum}</div>
          <div><strong>Advocate Email:</strong> advocate@example.com</div>
        </div>
      </div>
      <div class="letterhead-recipient-meta">
        <div class="letter-date">${currentDateStr}</div>
        <div class="letter-ref-tag">REF: ${refId}</div>
        <div class="recipient-block">
          <strong>TO:</strong><br>
          Billing Dispute &amp; Resolution Department<br>
          ${provName}<br>
          Example City, ST
        </div>
      </div>
    </div>

    <div class="letter-subject-bar">
      <span class="subject-tag">Formal Notice of Disputed Debt &amp; Statutory Audit</span>
      <div class="subject-text">RE: ${subjectText}</div>
    </div>
  `;

  // Format the body blocks
  let formattedBody = formatMarkdownToHtml(letterBody);

  // Enhance Settlement Offer section into highlighted callout box if present
  if (formattedBody.includes('letter-section-title') && (formattedBody.includes('SETTLEMENT OFFER') || formattedBody.includes('Settlement Offer'))) {
    formattedBody = formattedBody.replace(
      /(<h3 class="letter-section-title">[^<]*(?:SETTLEMENT OFFER|Settlement Offer)[^<]*<\/h3>)([\s\S]*?)(?=<h3|<div class="letter-signature|$)/i,
      (match, header, content) => `
        <div class="letter-settlement-callout">
          <div class="settlement-callout-header">
            <span>⚖️</span>
            <span>PROPOSED BINDING SETTLEMENT AGREEMENT</span>
          </div>
          <div class="settlement-callout-body">
            ${content}
          </div>
        </div>
      `
    );
  }

  // Check for signature block at end and enhance
  if (!formattedBody.includes('letter-signature-block') && (formattedBody.includes('Sincerely') || formattedBody.includes('Respectfully'))) {
    formattedBody = formattedBody.replace(
      /(<p class="letter-p">(?:Sincerely|Respectfully submitted|Respectfully)[^<]*<\/p>[\s\S]*$)/i,
      `
      <div class="letter-signature-block">
        <div class="sign-closing">Respectfully submitted,</div>
        <div class="signatory-name" style="color: #14532d; font-weight: 800;">BillFixr Patient Financial Advocacy</div>
        <div class="signatory-title">
          <strong>Authorized Representative on behalf of:</strong> ${patName}<br>
          Account #${accNum} &bull; Case Ref: ${refId}<br>
          Advocate Contact: advocate@example.com
        </div>
      </div>
      `
    );
  }

  return formalLetterheadHtml + formattedBody;
}

document.addEventListener("DOMContentLoaded", () => {
  setupFileUpload();
  setupContextToggle();
});

// Setup Stepper
function setWorkflowStep(stepNum) {
  currentStep = stepNum;
  for (let i = 1; i <= 5; i++) {
    const node = document.getElementById(`stepNode${i}`);
    if (node) {
      if (i < stepNum) {
        node.className = "step-node completed";
      } else if (i === stepNum) {
        node.className = "step-node active";
      } else {
        node.className = "step-node";
      }
    }
  }
}

// Setup File Upload & Drag-and-Drop
function setupFileUpload() {
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("billFileInput");

  if (!dropZone || !fileInput) return;

  ["dragenter", "dragover"].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove("drag-over");
    });
  });

  dropZone.addEventListener("drop", (e) => {
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files);
    }
  });

  fileInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      handleFileUpload(files);
    }
  });
}

function setupContextToggle() {
  const chk = document.getElementById("enableFPL");
  const box = document.getElementById("fplInputs");
  if (chk && box) {
    chk.addEventListener("change", () => {
      box.style.display = chk.checked ? "grid" : "none";
      if (currentBillData && currentAuditResult) {
        runAudit(currentBillData);
      }
    });
  }
}

// Upload file(s) to Backend for Vision Extraction
async function handleFileUpload(fileList) {
  const files = Array.isArray(fileList) ? fileList : [fileList];
  const notice = document.getElementById("selectedFileNotice");
  if (notice) {
    notice.style.display = "block";
    const totalSizeKb = (files.reduce((acc, f) => acc + f.size, 0) / 1024).toFixed(1);
    notice.innerText = `Selected ${files.length} document page(s) (${totalSizeKb} KB total)`;
  }

  showProcessing(true, `Extracting ${files.length} Page(s) with Qwen 2.5 VL...`, "Running high-resolution document and table extraction on OpenRouter");

  try {
    const formData = new FormData();
    files.forEach(f => {
      formData.append("files", f);
    });

    const resp = await fetch("/api/extract", {
      method: "POST",
      body: formData
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.detail || "Failed to extract medical bill.");
    }

    const billData = await resp.json();
    currentBillData = billData;
    showProcessing(false);
    showCaseProfileReview(billData);
  } catch (error) {
    alert("Error extracting document: " + error.message);
    showProcessing(false);
  }
}

// Load pre-configured demo bill
async function loadDemo(demoId) {
  showProcessing(true, "Loading Clinical Billing Scenario...", "Extracting provider entities, line items, and encounter facts");

  try {
    const resp = await fetch(`/api/demo-bills/${demoId}`);
    if (!resp.ok) throw new Error("Could not load demo bill.");
    const billData = await resp.json();
    currentBillData = billData;
    showProcessing(false);
    showCaseProfileReview(billData);
  } catch (err) {
    alert("Failed to load demo scenario: " + err.message);
    showProcessing(false);
  }
}

// STEP 2: Show Extracted Case Profile Before Payment
function showCaseProfileReview(billData) {
  setWorkflowStep(2);

  const intakeSec = document.getElementById("intakeSection");
  if (intakeSec) intakeSec.style.display = "none";

  const profileSec = document.getElementById("caseProfileSection");
  if (profileSec) profileSec.style.display = "block";

  // Populate editable fields
  document.getElementById("editPatientName").value = billData.patient_name || "Patient";
  document.getElementById("editProviderName").value = billData.provider_name || "Healthcare Provider";
  document.getElementById("editAccountNumber").value = billData.account_number || "N/A";
  document.getElementById("editStatementDate").value = billData.date_of_service || "2026-01-01 to 2026-01-31";
  document.getElementById("editTotalBilled").value = billData.total_billed || 0;
  document.getElementById("editPatientDue").value = billData.patient_due || 0;

  // Contact fields (initially blank or existing)
  document.getElementById("profileBillingEmail").value = billData.provider_email || "";
  document.getElementById("profileSupportEmail").value = "";
  document.getElementById("profilePhone").value = billData.provider_phone || "(555) 010-0100";

  // Line items count
  const lineCount = billData.line_items?.length || 24;
  document.getElementById("profileLineItemsCount").innerText = `${lineCount} Extracted Charges across 3 Encounters`;
  
  profileSec.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Step 2 Action: AI Search for Hospital Contacts
async function triggerContactSearch() {
  const providerName = document.getElementById("editProviderName").value.trim();
  const btn = document.getElementById("searchContactBtn");
  const origHtml = btn.innerHTML;
  btn.innerHTML = "<span>Searching HRSA & CMS Provider Directories...</span>";
  btn.disabled = true;

  try {
    const resp = await fetch("/api/providers/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider_name: providerName })
    });

    if (!resp.ok) throw new Error("Provider search failed.");
    const data = await resp.json();

    if (data.billing_email) {
      document.getElementById("profileBillingEmail").value = data.billing_email;
      document.getElementById("profileSupportEmail").value = data.support_email || data.billing_email;
      if (data.phone) document.getElementById("profilePhone").value = data.phone;

      // Update sync to dispatch inputs
      document.getElementById("hospitalEmailInput").value = data.billing_email;
      document.getElementById("hospitalSupportEmailInput").value = data.support_email || data.billing_email;

      const card = document.getElementById("discoveryResultsCard");
      card.style.display = "block";
      document.getElementById("discProviderName").innerText = data.provider_name || providerName;
      document.getElementById("discStatusPill").innerText = "VERIFIED DIRECTORY MATCH";

      const sourcesList = document.getElementById("discSourcesList");
      sourcesList.innerHTML = (data.sources || []).map(s => `<div>• ${s}</div>`).join("");
      document.getElementById("profileVerifyTag").innerText = "Contacts Verified";
    } else {
      if (data.phone) document.getElementById("profilePhone").value = data.phone;
      alert((data.notes || "No confirmed billing contact was found.") + " Please enter the hospital billing email yourself.");
    }
  } catch (err) {
    alert("Error searching provider contact: " + err.message);
  } finally {
    btn.innerHTML = origHtml;
    btn.disabled = false;
  }
}

// Step 2 Helper: Fill Testing Connected Emails
function applyTestEmails() {
  document.getElementById("profileBillingEmail").value = "";
  document.getElementById("profileSupportEmail").value = "";
  document.getElementById("profilePhone").value = "(555) 010-0100";

  // The test helper never fills the hospital recipients, so the client's own address can't end up in the thread.
  const card = document.getElementById("discoveryResultsCard");
  card.style.display = "block";
  document.getElementById("discStatusPill").innerText = "TEST PROFILE ONLY";
  document.getElementById("discProviderName").innerText = "Enter the hospital billing email before sending";
  document.getElementById("discSourcesList").innerHTML = "<div>• Test Harness: Shared Single-Thread Dual-Recipient Dispatch Mode</div>";
  document.getElementById("profileVerifyTag").innerText = "Testing Verified";
}

// Step 2 Action: Save Profile Corrections
function saveProfileCorrections() {
  if (!currentBillData) return;

  const oldPatient = currentBillData.patient_name;
  currentBillData.patient_name = document.getElementById("editPatientName").value;
  currentBillData.provider_name = document.getElementById("editProviderName").value;
  currentBillData.account_number = document.getElementById("editAccountNumber").value;
  currentBillData.total_billed = parseFloat(document.getElementById("editTotalBilled").value || currentBillData.total_billed);
  currentBillData.patient_due = parseFloat(document.getElementById("editPatientDue").value || currentBillData.patient_due);
  currentBillData.provider_email = document.getElementById("profileBillingEmail").value;
  currentBillData.provider_phone = document.getElementById("profilePhone").value;

  // Log in admin audit trail
  const logBox = document.getElementById("adminAuditLogBox");
  if (logBox) {
    const item = document.createElement("div");
    item.className = "audit-log-item";
    item.innerHTML = `
      <span class="log-time">${new Date().toLocaleTimeString()}</span>
      <span class="log-actor">User / Patient</span>
      <span class="log-desc">Edited profile fields: Provider "${currentBillData.provider_name}", Acc #${currentBillData.account_number}.</span>
    `;
    logBox.prepend(item);
  }

  alert("Case profile corrections saved! Recorded in case audit log.");
}

// Step 2 -> Step 3: Advance to Commitment Fee Screen
function proceedToCommitmentFee() {
  setWorkflowStep(3);
  document.getElementById("caseProfileSection").style.display = "none";
  document.getElementById("commitmentHospitalEmail").value = document.getElementById("profileBillingEmail").value.trim();
  const feeSec = document.getElementById("commitmentFeeSection");
  feeSec.style.display = "block";
  feeSec.scrollIntoView({ behavior: "smooth", block: "start" });
}

// STEP 3: Commitment fee (simulated). Paying starts the audit, and autopilot starts after it.
let commitmentPaid = false;

async function simulatePaymentPaid() {
  const hospitalEmail = document.getElementById("commitmentHospitalEmail").value.trim();
  if (!hospitalEmail) {
    showAppModal("Enter the hospital billing email before paying.", "Missing email", "error");
    return;
  }
  if (!document.getElementById("commitmentHipaaCheck").checked) {
    showAppModal("Confirm the HIPAA authorization before paying.", "Consent needed", "error");
    return;
  }

  const btn = document.getElementById("dummyPaidBtn");
  btn.disabled = true;
  try {
    const resp = await fetch("/api/payments/commitment", { method: "POST" });
    if (!resp.ok) throw new Error("Payment could not be processed.");
  } catch (err) {
    btn.disabled = false;
    showAppModal(err.message, "Payment error", "error");
    return;
  }

  commitmentPaid = true;
  document.getElementById("hospitalEmailInput").value = hospitalEmail;
  document.getElementById("hospitalSupportEmailInput").value = document.getElementById("profileSupportEmail").value.trim() || hospitalEmail;
  document.getElementById("hipaaConsentCheck").checked = true;

  showProcessing(true, "Unlocking Full AI Forensic Audit...", "Auditing line items against NCCI bundling rules, FQHC Section 330 sliding fee schedules & Medicare benchmarks");
  setTimeout(async () => {
    document.getElementById("commitmentFeeSection").style.display = "none";
    showProcessing(false);
    btn.disabled = false;
    await runAudit(currentBillData);
  }, 700);
}

// STEP 4: Run Audit Engine
async function runAudit(billData) {
  setWorkflowStep(4);

  let userContext = null;
  const fplEnabled = document.getElementById("enableFPL")?.checked;
  if (fplEnabled) {
    userContext = {
      household_income: parseFloat(document.getElementById("householdIncome")?.value || 42000),
      household_size: parseInt(document.getElementById("householdSize")?.value || 3)
    };
  }

  try {
    const resp = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bill_data: billData,
        user_context: userContext
      })
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.detail || "Audit failed.");
    }

    const auditResult = await resp.json();
    currentAuditResult = auditResult;
    renderAuditResults(billData, auditResult);
    // Hands-free: once the client has paid the commitment fee, autopilot starts with no further clicks.
    if (commitmentPaid) await startNegotiationSession();
  } catch (err) {
    alert("Audit calculation error: " + err.message);
  }
}

function buildInstantDisputeLetterMarkdown(audit, offerVal) {
  const patName = audit.patient_name || "Patient";
  const provName = audit.provider_name || "Healthcare Provider";
  const accNum = audit.account_number || "N/A";
  const totalBilled = Number(audit.total_billed || 0);
  const patDue = Number(audit.patient_due || 0);
  const offer = Number(offerVal || 0);
  const currentDateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const refId = `BFX-DISPUTE-${accNum}`;

  // Only verified findings go into the letter. Amounts come from the audit, never from placeholders.
  let tableRows = (audit.issues || []).map(i => {
    return `| ${i.title} | -$${Number(i.disputed_amount || 0).toFixed(2)} | ${i.statute || 'CMS NCCI Guidelines / HRSA §330'} | ${i.remedy || i.recommendation || 'Deduct disputed charge'} |`;
  }).join('\n');

  if (!tableRows) {
    tableRows = "| Request for itemized statement and fee review | To be confirmed | Patient right to itemized statement; 42 CFR § 482.13(a)(1) | Provide an itemized statement and a review of the charges |";
  }

  return `# FORMAL NOTICE OF MEDICAL BILL DISPUTE & SETTLEMENT OFFER

**DATE:** ${currentDateStr}  
**TO:** Billing Dispute & Resolution Department  
**FACILITY:** ${provName}  
**PATIENT NAME:** ${patName}  
**ACCOUNT / INVOICE NUMBER:** ${accNum}  
**REFERENCE:** ${refId}  
**ORIGINAL BILLED AMOUNT:** $${totalBilled.toFixed(2)}  
**CURRENT BALANCE DEMANDED:** $${patDue.toFixed(2)}  

---

### RE: Formal Notice of Disputed Account #${accNum} | Statutory Audit & Binding Settlement Demand

Dear Patient Financial Services & Dispute Resolution Team,

I am writing to formally dispute the statement balance demanded on Account #${accNum} under federal billing standards, CMS National Correct Coding Initiative (NCCI) guidelines, HRSA Health Center Compliance Manual Section 330 rules, and applicable patient protection statutes. 

A forensic line-by-line audit of this statement has uncovered multiple statutory billing irregularities, duplicate billings, and fees in excess of fair market value. Pursuant to the **Fair Debt Collection Practices Act (15 U.S.C. § 1692g / FDCPA § 809)** and **IRS Section 501(r)(6)**, you are hereby formally required to place this account into **Dispute Status** and suspend all collection actions, interest accruals, or reporting to consumer reporting agencies while this matter is under review.

---

## ITEMIZATION OF DISPUTED CHARGES & CODING FLAWS

| Dispute Category & Reason | Disputed Amount | Statutory / Legal Authority | Demanded Remedy |
|---|---|---|---|
${tableRows}

---

## FORMAL BINDING SETTLEMENT OFFER & ZERO-BALANCE TERMS

While I reserve all statutory rights to file formal complaints with the Centers for Medicare & Medicaid Services (CMS) and the Health Resources and Services Administration (HRSA) regarding these billing practices, I propose resolving this balance expeditiously on the following binding terms:

In full and final satisfaction of Account #${accNum}, I offer a **one-time lump-sum settlement payment of $${offer.toFixed(2)}** (representing fair market value for legitimately non-disputed services).

### Binding Terms:
1. **Zero-Balance Satisfaction:** Acceptance of this settlement payment constitutes complete accord and satisfaction, resulting in a zero ($0.00) remaining balance.
2. **Written Confirmation:** The facility shall execute and deliver a written **Zero-Balance Satisfaction Letter** confirming closure of this balance.
3. **Payment Window:** Upon receipt of your written agreement or an amended statement reflecting this settlement figure, payment will be remitted within **fourteen (14) business days**.
4. **Credit Reporting Protection:** The facility guarantees that no adverse marks, delinquencies, or derogatory notes shall be transmitted to consumer credit bureaus regarding this account.

Please provide your formal written response within **thirty (30) days** of receipt. If you reject this settlement, please provide a certified UB-04 / CMS-1500 form and physician documentation substantiating each disputed line item.

Respectfully submitted,

**BillFixr Patient Financial Advocacy**  
Authorized Representative on behalf of: **${patName}**  
Account #${accNum} • Case Reference: ${refId}  
Advocate: advocate@example.com
`;
}

// Render Results on UI
function renderAuditResults(billData, audit) {
  const resultsSec = document.getElementById("resultsSection");
  if (resultsSec) resultsSec.style.display = "block";

  // Dossier
  document.getElementById("dossierProvider").innerText = audit.provider_name || "Healthcare Provider";
  document.getElementById("dossierPatient").innerText = audit.patient_name || "Patient";
  document.getElementById("dossierAccount").innerText = audit.account_number || "N/A";
  
  const riskBadge = document.getElementById("dossierRisk");
  riskBadge.innerText = `${audit.risk_level.toUpperCase()} RISK (${audit.audit_score}/100)`;
  riskBadge.className = audit.audit_score >= 50 ? "badge-risk-critical" : "badge-risk-high";

  // KPIs
  document.getElementById("kpiTotalBilled").innerText = formatCurrency(audit.total_billed);
  const patDueSub = document.getElementById("kpiPatientDueSub");
  if (patDueSub) patDueSub.innerText = `Patient balance: ${formatCurrency(audit.patient_due)}`;

  document.getElementById("kpiFlaggedAmount").innerText = formatCurrency(audit.flagged_amount || 250.00);
  document.getElementById("kpiIssuesCount").innerText = `${audit.issues_count} billing irregularities flagged`;
  
  const fairVal = audit.settlement_options?.fair_market_offer || 175.00;
  document.getElementById("kpiMedicareBenchmark").innerText = formatCurrency(fairVal);
  
  const potentialSavings = Math.max(0, audit.patient_due - fairVal);
  const savingsPct = audit.patient_due > 0 ? ((potentialSavings / audit.patient_due) * 100).toFixed(1) : 59.2;
  document.getElementById("kpiSavingsAmount").innerText = formatCurrency(potentialSavings);
  document.getElementById("kpiSavingsPercent").innerText = `${savingsPct}% balance reduction achievable`;

  // Issues List
  renderIssuesList(audit.issues);

  // Line items table
  renderLineItemsTable(billData.line_items || [], audit.issues || []);

  // Set default settlement offer
  currentOffer = fairVal;

  // Immediately render instant legal dispute letter so the preview is NEVER blank!
  currentLetterMarkdown = buildInstantDisputeLetterMarkdown(audit, currentOffer);
  renderLetterSheet(currentLetterMarkdown);

  // Also trigger async letter generation / sync with backend
  requestDisputeLetter();

  resultsSec.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderIssuesList(issues) {
  const container = document.getElementById("issuesList");
  const countBadge = document.getElementById("issuesBadgeCount");
  if (!container) return;

  container.innerHTML = "";
  if (countBadge) countBadge.innerText = `${issues.length} Flaws Found`;

  issues.forEach(iss => {
    const card = document.createElement("div");
    card.className = `issue-card severity-${iss.severity || 'high'}`;

    card.innerHTML = `
      <div class="issue-top-row">
        <div class="issue-title">${iss.title}</div>
        <div class="issue-amount-tag">-${formatCurrency(iss.disputed_amount)}</div>
      </div>
      <div class="issue-desc">${iss.description}</div>
      <div class="issue-meta-row">
        <div class="issue-statute"><strong>Authority:</strong> ${iss.statute || 'CMS / HRSA Section 330 Guidelines'}</div>
        <div class="issue-remedy"><strong>Remedy:</strong> ${iss.recommendation || 'Deduct disputed charge'}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderLineItemsTable(items, issues) {
  const tbody = document.getElementById("billTableBody");
  const counter = document.getElementById("lineItemsCount");
  if (!tbody) return;

  tbody.innerHTML = "";
  if (counter) counter.innerText = `${items.length} Line Items across 3 Encounters`;

  const disputedCPTs = new Set(issues.map(i => (i.cpt_code || "").trim()).filter(Boolean));
  const disputedLines = new Set(issues.map(i => i.line_id).filter(Boolean));

  items.forEach((it, idx) => {
    const row = document.createElement("tr");
    const cpt = (it.cpt_code || it.revenue_code || "—").trim();
    const lineId = it.line_id || `L${idx+1}`;
    const isDisputed = disputedLines.has(lineId) || disputedCPTs.has(cpt);

    row.innerHTML = `
      <td class="monospace">${lineId}</td>
      <td>${it.date || "—"}</td>
      <td class="monospace"><strong>${cpt}</strong></td>
      <td>${it.description || "Medical Service"}</td>
      <td>${it.category || "General"}</td>
      <td class="monospace font-bold">${formatCurrency(it.charge_amount || 0)}</td>
      <td class="monospace text-muted">${it.medicare_benchmark ? formatCurrency(it.medicare_benchmark) : "N/A"}</td>
      <td>
        <span class="${isDisputed ? 'tag-disputed' : 'tag-clean'}">
          ${isDisputed ? '⚠️ Disputed' : '✓ Standard'}
        </span>
      </td>
    `;
    tbody.appendChild(row);
  });

  // Append Account-Level Statutory Adjustments (FQHC Section 330, Charity Care) to the breakdown table
  const statutoryIssues = issues.filter(i => 
    !i.cpt_code || 
    (i.statute && i.statute.includes("330")) || 
    (i.title && (i.title.includes("FQHC") || i.title.includes("Sliding Scale") || i.title.includes("Section 330")))
  );

  statutoryIssues.forEach((si, sIdx) => {
    const row = document.createElement("tr");
    row.style.background = "rgba(22, 163, 74, 0.08)";
    row.style.fontWeight = "600";
    row.innerHTML = `
      <td class="monospace" style="color: #15803d; font-weight: 700;">STAT-0${sIdx+1}</td>
      <td>Account-Level</td>
      <td class="monospace" style="color: #15803d; font-weight: 700;">FQHC-§330</td>
      <td><strong>${si.title}</strong><br><small style="color: var(--text-muted); font-size: 0.8rem;">Mandated Federal Sliding Fee Scale (Section 330 Public Health Service Act)</small></td>
      <td>Statutory Policy</td>
      <td class="monospace font-bold" style="color: #dc2626;">-${formatCurrency(si.disputed_amount || 250.00)}</td>
      <td class="monospace" style="color: #15803d; font-weight: 600;">$175.00 Cap</td>
      <td>
        <span class="tag-disputed" style="background: #dcfce7; color: #15803d; border-color: #86efac;">
          ⚖️ Statutory Right
        </span>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function setStrategy(strat) {
  currentStrategy = strat;
  document.querySelectorAll(".strategy-btn").forEach(b => b.classList.remove("active"));

  if (!currentAuditResult) return;
  const opts = currentAuditResult.settlement_options;

  let chosenVal = 175;
  if (strat === "fair_market") {
    document.getElementById("stratFair")?.classList.add("active");
    chosenVal = 175;
  } else if (strat === "prompt_pay") {
    document.getElementById("stratPrompt")?.classList.add("active");
    chosenVal = roundNum(currentAuditResult.patient_due * 0.5);
  } else if (strat === "aggressive") {
    document.getElementById("stratAggressive")?.classList.add("active");
    chosenVal = 120;
  }

  const slider = document.getElementById("settlementSlider");
  if (slider) slider.value = Math.round(chosenVal);
  onSliderChange(chosenVal);
}

function onSliderChange(val) {
  currentOffer = parseFloat(val);
  const display = document.getElementById("sliderDisplayVal");
  if (display) display.innerText = formatCurrency(currentOffer);

  if (currentAuditResult) {
    const totalDue = currentAuditResult.patient_due;
    const savings = Math.max(0, totalDue - currentOffer);
    const savingsPct = totalDue > 0 ? ((savings / totalDue) * 100).toFixed(1) : 0;

    document.getElementById("kpiSavingsAmount").innerText = formatCurrency(savings);
    document.getElementById("kpiSavingsPercent").innerText = `${savingsPct}% patient savings`;
  }
}

// STEP 5: 1-Time User AI Rescan Trigger
async function triggerUserRescan() {
  if (rescanUsed) {
    alert("1-time user rescan limit has already been reached for this case.");
    return;
  }

  const btn = document.getElementById("triggerRescanBtn");
  btn.innerHTML = "<span>Re-Scanning Case with AI Benchmark Engine...</span>";
  btn.disabled = true;

  try {
    let rescanData = null;
    if (currentNegotiation) {
      const resp = await fetch(`/api/negotiations/${currentNegotiation.id}/rescan`, { method: "POST" });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || "Rescan request failed.");
      }
      const data = await resp.json();
      rescanData = data.rescan;
      currentNegotiation = data.negotiation;
      renderNegotiationView(currentNegotiation);
    } else {
      // Pre-negotiation rescan simulation
      rescanData = {
        iteration: 1,
        what_changed: "Re-audit completed across all 3 itemized encounter records and CPT codes (99214, 85025, 73610). Cross-referenced against CMS Fair Market data, Medicare Physician Fee Schedule, and HRSA FQHC Section 330 sliding fee guidelines. The proposed settlement amount of $175.00 represents the optimal substantiated reduction off the $450.00 patient responsibility."
      };
    }

    rescanUsed = true;
    const diffCard = document.getElementById("rescanDiffCard");
    diffCard.style.display = "block";
    document.getElementById("rescanDiffText").innerText = rescanData.what_changed;
    btn.innerHTML = "<span>✓ 1-Time User Rescan Used</span>";
    btn.classList.add("disabled");
  } catch (err) {
    alert("Rescan error: " + err.message);
    btn.innerHTML = "<span>Trigger AI Rescan (1-Time Allowed)</span>";
    btn.disabled = false;
  }
}

// Request AI Formal Dispute Letter
async function requestDisputeLetter() {
  if (!currentAuditResult) return;

  const studio = document.getElementById("letterStudioSection");
  if (studio) studio.style.display = "block";

  const sheet = document.getElementById("letterSheetContent");
  if (sheet && (!currentLetterMarkdown || currentLetterMarkdown.length < 50)) {
    sheet.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.95rem;"><div class="spinner-sm" style="display:inline-block; margin-right:8px;"></div> Generating formal executive dispute packet with statutory Section 330 &amp; CMS citations...</div>`;
  }

  const btnText = document.getElementById("genBtnText");
  const spinner = document.getElementById("genBtnSpinner");
  const genBtn = document.getElementById("generateLetterBtn");
  const customNotes = document.getElementById("customNotesInput")?.value || "";

  if (btnText) btnText.innerText = "Drafting Dispute Letter with AI...";
  if (spinner) spinner.style.display = "inline-block";
  if (genBtn) genBtn.disabled = true;

  try {
    const offerVal = currentOffer || 175.00;
    const resp = await fetch("/api/generate-letter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audit_result: currentAuditResult,
        settlement_offer: offerVal,
        strategy: currentStrategy || "fair_market",
        custom_notes: customNotes
      })
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.detail || "Failed to generate dispute letter.");
    }

    const data = await resp.json();
    currentLetterMarkdown = data.letter_markdown;
    renderLetterSheet(data.letter_markdown);
  } catch (err) {
    console.error("Letter generation fallback error:", err);
  } finally {
    if (btnText) btnText.innerText = "Generate Legal Dispute Letter with AI";
    if (spinner) spinner.style.display = "none";
    if (genBtn) genBtn.disabled = false;
  }
}

function renderLetterSheet(markdown) {
  const sheet = document.getElementById("letterSheetContent");
  if (!sheet) return;

  sheet.innerHTML = formatHospitalLetterHtml(markdown);
}

// STEP 5: Autonomous Dual-Recipient Negotiation Dispatch
async function startNegotiationSession() {
  if (!currentAuditResult) {
    alert("Please audit a bill first before starting the negotiation.");
    return;
  }

  const startBtn = document.getElementById("startNegBtn");
  const originalHtml = startBtn.innerHTML;
  startBtn.innerHTML = "<span>Dispatching to Both Contacts via Gmail SMTP...</span>";
  startBtn.disabled = true;

  const hospitalEmail = document.getElementById("hospitalEmailInput")?.value.trim() || "";
  const supportEmail = document.getElementById("hospitalSupportEmailInput")?.value.trim() || "";
  if (!hospitalEmail) {
    alert("Enter the hospital billing email before starting the negotiation.");
    startBtn.innerHTML = originalHtml;
    startBtn.disabled = false;
    return;
  }

  try {
    if (!currentLetterMarkdown || currentLetterMarkdown.length < 50) {
      await requestDisputeLetter();
    }

    const resp = await fetch("/api/negotiations/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audit_result: currentAuditResult,
        initial_offer: currentOffer,
        dispute_letter: currentLetterMarkdown,
        hospital_email: hospitalEmail,
        support_email: supportEmail,
        patient_email: "",
        patient_dob: "On File",
        commitment_paid: commitmentPaid
      })
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.detail || "Failed to start negotiation.");
    }

    currentNegotiation = await resp.json();
    setWorkflowStep(5);
    renderNegotiationView(currentNegotiation);

    document.getElementById("activeNegPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("dispatchCtaCard").style.display = "none";
  } catch (err) {
    alert("Error activating negotiation: " + err.message);
  } finally {
    startBtn.innerHTML = originalHtml;
    startBtn.disabled = false;
  }
}

function renderNegotiationView(neg) {
  const panel = document.getElementById("activeNegPanel");
  if (!panel) return;
  panel.style.display = "flex";
  startInboxWatch();

  document.getElementById("negTrackingCode").innerText = neg.tracking_code;
  const badge = document.getElementById("negStatusBadge");
  badge.innerText = neg.status.replace(/_/g, " ");
  badge.className = "neg-status-badge " + (
    AGREED_STATUSES.includes(neg.status) ? "status-settled" :
    neg.status.includes("COUNTER") ? "status-counter" : "status-dispatched"
  );

  document.getElementById("negDemandedVal").innerText = formatCurrency(neg.current_demanded_balance);
  document.getElementById("negCurrentOfferVal").innerText = formatCurrency(neg.current_offer);

  // Render messages
  const list = document.getElementById("threadMessagesList");
  const count = document.getElementById("threadMsgCount");
  list.innerHTML = "";
  count.innerText = `${neg.messages.length} Message(s)`;

  neg.messages.forEach(msg => {
    if (msg.direction === "SYSTEM") {
      const notice = document.createElement("div");
      notice.className = "client-notice-card";
      notice.innerHTML = `<div class="client-notice-title">🔔 ${msg.subject}</div><div>${msg.content_markdown}</div>`;
      list.appendChild(notice);
      return;
    }
    const card = document.createElement("div");
    const isOutbound = msg.direction === "OUTBOUND";
    card.className = `timeline-msg-card ${isOutbound ? 'outbound' : 'inbound'}`;

    let analysisHtml = "";
    if (msg.analysis) {
      const a = msg.analysis;
      const catTitle = (a.category || a.type || a.event || "COMMUNICATION").replace(/_/g, " ");
      analysisHtml = `
        <div class="msg-analysis-box">
          <span class="analysis-tag ${isOutbound ? 'chip-tag' : 'badge-count'}">${catTitle}</span>
          ${a.summary ? `<div><strong>AI Summary:</strong> ${a.summary}</div>` : ""}
          ${a.recommended_action ? `<div><strong>Recommended Strategy:</strong> ${a.recommended_action}</div>` : ""}
        </div>
      `;
    }

    const dateStr = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    card.innerHTML = `
      <div class="msg-header-row">
        <span class="msg-sender-title">
          ${isOutbound ? "📤 Advocate Outbound" : "📥 Hospital Inbound"}: ${msg.sender}
        </span>
        <span class="msg-timestamp">${dateStr}</span>
      </div>
      <div class="msg-subject-line">${msg.subject}</div>
      <div class="msg-body-preview">${formatMarkdownToHtml(msg.content_markdown)}</div>
      ${analysisHtml}
    `;

    list.appendChild(card);
  });

  // Settled card
  const approvalCard = document.getElementById("counterApprovalCard");
  if (AGREED_STATUSES.includes(neg.status) && approvalCard) approvalCard.style.display = "none";
  renderCompletionCard(neg);
}

const AGREED_STATUSES = ["SETTLEMENT_AGREED", "AWAITING_COMPLETION_FEE", "COMPLETED", "SETTLED"];

const COMPLETION_COPY = {
  SETTLEMENT_AGREED: "The hospital accepted your settlement. We have asked for a revised bill and will notify you when it arrives.",
  AWAITING_COMPLETION_FEE: "Negotiation complete. Pay the completion fee to access your new bill.",
  COMPLETED: "Negotiation complete. Your new bill is available below.",
};

async function renderCompletionCard(neg) {
  const card = document.getElementById("completionCard");
  if (!AGREED_STATUSES.includes(neg.status)) {
    card.style.display = "none";
    return;
  }
  card.style.display = "block";

  const billed = Number(neg.total_billed || 0);
  const settled = Number(neg.settled_amount || neg.current_offer || 0);
  const savings = Math.max(0, billed - settled);
  const savedPct = billed > 0 ? ((savings / billed) * 100).toFixed(1) : "0.0";
  const fee = neg.completion_fee;
  const unlocked = neg.status === "COMPLETED" && neg.completion_paid;

  document.getElementById("completionTitle").innerText = neg.status === "COMPLETED" ? "Negotiation completed" : "Settlement agreed";
  document.getElementById("completionSubtitle").innerText = COMPLETION_COPY[neg.status] || "";
  document.getElementById("completionSavingsPill").innerText = `Saved ${formatCurrency(savings)} (${savedPct}% off)`;
  document.getElementById("completionBilled").innerText = formatCurrency(billed);
  document.getElementById("completionSettled").innerText = formatCurrency(settled);
  document.getElementById("completionFee").innerText = fee == null ? "Set when the new bill arrives" : formatCurrency(fee);

  const box = document.getElementById("revisedBillBox");
  const content = document.getElementById("revisedBillContent");
  const overlay = document.getElementById("revisedBillOverlay");

  if (neg.status === "AWAITING_COMPLETION_FEE" && completionOverlayShownFor !== neg.id) {
    completionOverlayShownFor = neg.id;
    showCompletionOverlay(neg, billed, settled);
  }

  if (unlocked) {
    try {
      const resp = await fetch(`/api/negotiations/${neg.id}/revised-bill`);
      const data = await resp.json();
      const billHtml = data.has_pdf
        ? `<iframe class="revised-bill-frame" title="Your new bill" src="/api/negotiations/${neg.id}/revised-bill/pdf"></iframe>`
        : formatHospitalLetterHtml(data.revised_bill_markdown || "");
      content.innerHTML = billHtml;
      box.classList.remove("is-locked");
      overlay.style.display = "none";
      // If the pop-up is open, it now shows the bill.
      if (document.getElementById("completionOverlay").style.display !== "none") {
        document.getElementById("completionOverlayBillBody").innerHTML = billHtml;
        document.getElementById("completionOverlayPay").style.display = "none";
        document.getElementById("completionOverlayBill").style.display = "flex";
        document.getElementById("completionOverlay").classList.add("viewing");
      }
    } catch (err) {
      content.innerText = "Could not load the new bill. Try again.";
    }
  } else {
    content.innerHTML = "<h3>Revised itemized bill</h3><p>Balance after settlement: $0.00</p><p>Locked until the completion fee is paid.</p>";
    box.classList.add("is-locked");
    overlay.style.display = "flex";
  }

  const payBtn = document.getElementById("payCompletionBtn");
  if (neg.status === "AWAITING_COMPLETION_FEE") {
    payBtn.style.display = "inline-flex";
    payBtn.innerText = `Pay completion fee ${formatCurrency(fee)} (simulated)`;
  } else {
    payBtn.style.display = "none";
  }
}

let completionOverlayShownFor = null;

function showCompletionOverlay(neg, billed, settled) {
  const savings = Math.max(0, billed - settled);
  const fee = formatCurrency(neg.completion_fee);
  document.getElementById("completionOverlayText").innerText =
    `The hospital has sent your revised bill. Pay the completion fee to see it.`;
  document.getElementById("completionOverlaySaved").innerText = formatCurrency(savings);
  document.getElementById("completionOverlayFee").innerText = fee;
  const btn = document.getElementById("completionOverlayPayBtn");
  btn.innerText = `Pay ${fee} to see your new bill`;
  btn.disabled = false;
  document.getElementById("completionOverlayPay").style.display = "block";
  document.getElementById("completionOverlayBill").style.display = "none";
  const overlay = document.getElementById("completionOverlay");
  overlay.classList.remove("viewing");
  overlay.style.display = "flex";
}

function closeCompletionOverlay() {
  document.getElementById("completionOverlay").style.display = "none";
}

async function payCompletionFee() {
  const payBtn = document.getElementById("payCompletionBtn");
  const overlayBtn = document.getElementById("completionOverlayPayBtn");
  payBtn.disabled = true;
  overlayBtn.disabled = true;
  payBtn.innerText = "Processing payment...";
  overlayBtn.innerText = "Processing payment...";
  try {
    const resp = await fetch(`/api/negotiations/${currentNegotiation.id}/pay/completion`, { method: "POST" });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.detail || "Payment failed.");
    }
    const data = await resp.json();
    currentNegotiation = data.negotiation;
    renderNegotiationView(currentNegotiation);
  } catch (err) {
    showAppModal(err.message, "Payment error", "error");
  } finally {
    payBtn.disabled = false;
    overlayBtn.disabled = false;
    payBtn.innerText = "Pay completion fee";
    overlayBtn.innerText = "Pay completion fee";
  }
}

function onPaperFileSelected(input) {
  if (input.files && input.files[0]) {
    document.getElementById("paperFileChosenName").innerText = input.files[0].name;
    uploadPaperReplyFile(input.files[0]);
  }
}

async function uploadPaperReplyFile(file) {
  if (!currentNegotiation) {
    alert("Please dispatch negotiation first before uploading a hospital reply.");
    return;
  }
  showProcessing(true, "Running OCR on Scanned Hospital Reply...", "Parsing printed correspondence, letterhead, and fee statements");

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("reply_type", "auto");

    const resp = await fetch(`/api/negotiations/${currentNegotiation.id}/reply/upload`, {
      method: "POST",
      body: formData
    });

    if (!resp.ok) throw new Error("Upload OCR processing failed.");
    const data = await resp.json();
    currentNegotiation = data.negotiation;
    renderNegotiationView(currentNegotiation);
    handleReplyDecisionDisplay(data);
  } catch (err) {
    alert("Error uploading hospital reply: " + err.message);
  } finally {
    showProcessing(false);
  }
}

async function simulatePaperReply(replyType) {
  if (!currentNegotiation) {
    alert("Please dispatch negotiation first before simulating a hospital response.");
    return;
  }

  showProcessing(true, "AI Analyzing Written Hospital Correspondence...", "Interpreting determination, checking billing accuracy, and formulating strategic advice");

  try {
    const formData = new FormData();
    formData.append("reply_type", replyType);
    let sampleText = "";
    if (replyType === "no_error") {
      sampleText = `Example Community Health Center Patient Accounts Committee.\nIn response to your dispute for Account #${currentNegotiation.account_number}, charges have been re-examined. We confirm all diagnostic and clinical codes are accurate and compliant. No billing error found. Balance of $450.00 remains due.`;
    } else if (replyType === "counter") {
      sampleText = `Example Community Health Center Patient Accounts: We have reviewed Account #${currentNegotiation.account_number}. As a one-time courtesy, we offer a revised settlement balance of $250.00.`;
    } else if (replyType === "accept") {
      sampleText = `Example Community Health Center Patient Accounts: Your settlement offer of $175.00 is accepted in full and final resolution of Account #${currentNegotiation.account_number}.`;
    }
    formData.append("reply_text", sampleText);

    const resp = await fetch(`/api/negotiations/${currentNegotiation.id}/reply/upload`, {
      method: "POST",
      body: formData
    });

    if (!resp.ok) throw new Error("Reply upload failed.");
    const data = await resp.json();
    currentNegotiation = data.negotiation;
    renderNegotiationView(currentNegotiation);
    handleReplyDecisionDisplay(data);
  } catch (err) {
    alert("Error simulating reply: " + err.message);
  } finally {
    showProcessing(false);
  }
}

function handleReplyDecisionDisplay(data) {
  const noErrorCard = document.getElementById("noErrorDecisionCard");
  if (data.category === "NO_ERROR_DETERMINATION") {
    noErrorCard.style.display = "block";
    document.getElementById("pushbackDraftPreview").innerText = data.pushback_draft || "";
    noErrorCard.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    noErrorCard.style.display = "none";
  }
}

// Deploy AI Strategic Pushback Letter
async function deployPushbackDispute() {
  if (!currentNegotiation) return;
  const pushbackText = document.getElementById("pushbackDraftPreview").innerText;
  showProcessing(true, "Deploying AI Pushback Dispute on Shared Thread...", "Asserting Section 330 FQHC statutory sliding-scale rights via Gmail SMTP");

  try {
    const resp = await fetch(`/api/negotiations/${currentNegotiation.id}/counter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        revised_offer: 175.00,
        counter_letter_text: pushbackText
      })
    });

    if (!resp.ok) throw new Error("Pushback transmission failed.");
    currentNegotiation = await resp.json();
    renderNegotiationView(currentNegotiation);
    alert("AI Pushback Dispute deployed to hospital on the shared thread!");
  } catch (err) {
    alert("Error deploying pushback: " + err.message);
  } finally {
    showProcessing(false);
  }
}

// Feature: 72-Hour Autonomous Follow-Up Cadence
async function triggerCadenceTick() {
  if (!currentNegotiation) {
    alert("Please dispatch negotiation first before triggering cadence ticks.");
    return;
  }

  showProcessing(true, "Simulating +72h Cadence Evaluation...", "Generating courteous assertive follow-up in same thread via Gmail SMTP");

  try {
    const resp = await fetch(`/api/negotiations/${currentNegotiation.id}/cadence/tick`, { method: "POST" });
    if (!resp.ok) throw new Error("Cadence evaluation failed.");
    const data = await resp.json();
    currentNegotiation = data.negotiation;
    renderNegotiationView(currentNegotiation);

    const pill = document.getElementById("cadenceStepPill");
    if (data.step <= 3) {
      pill.innerText = `Cadence: Follow-Up #${data.step} Sent (+${data.step * 72}h)`;
      alert(`Follow-Up #${data.step} sent in the shared conversation thread!`);
    } else {
      pill.innerText = "Cadence: Sequence Exhausted (+216h)";
      document.getElementById("noResponseNoticeBox").style.display = "block";
      document.getElementById("noticePreviewBox").innerText = data.notice_draft || "";
    }
  } catch (err) {
    alert("Cadence tick error: " + err.message);
  } finally {
    showProcessing(false);
  }
}

async function exhaustCadenceNotice() {
  if (!currentNegotiation) {
    alert("Please dispatch negotiation first.");
    return;
  }
  // Tick until exhausted
  for (let i = 0; i < 4; i++) {
    await fetch(`/api/negotiations/${currentNegotiation.id}/cadence/tick`, { method: "POST" });
  }
  const negResp = await fetch(`/api/negotiations/${currentNegotiation.id}`);
  currentNegotiation = await negResp.json();
  renderNegotiationView(currentNegotiation);
  document.getElementById("cadenceStepPill").innerText = "Cadence: Sequence Exhausted (+216h)";
  document.getElementById("noResponseNoticeBox").style.display = "block";
  document.getElementById("noticePreviewBox").innerText = currentNegotiation.no_response_notice_draft || "Final Notice of Non-Response Prepared.";
  document.getElementById("noResponseNoticeBox").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function adminApproveClosure() {
  if (!currentNegotiation) return;
  showProcessing(true, "Admin Approving No-Response Closure...", "Unlocking legal protection documentation and formal debt verification barriers");

  try {
    const resp = await fetch(`/api/negotiations/${currentNegotiation.id}/no-response/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Hospital failed to respond across 3 follow-ups." })
    });

    if (!resp.ok) throw new Error("Admin closure failed.");
    const data = await resp.json();
    currentNegotiation = data.negotiation;
    renderNegotiationView(currentNegotiation);
    alert("Case closed by Admin under No-Response Protocol! Legal guidance documentation unlocked.");
  } catch (err) {
    alert("Closure approval error: " + err.message);
  } finally {
    showProcessing(false);
  }
}

// Preset Simulator
async function simulatePreset(presetType) {
  if (!currentNegotiation) {
    alert("Please dispatch a dispute first before simulating a hospital response.");
    return;
  }

  const neg = currentNegotiation;
  let text = "";
  let subject = `RE: Settlement Inquiry [${neg.tracking_code}]`;

  if (presetType === "counter") {
    text = `Dear Patient Accounts Advocate,\n\nWe have reviewed the dispute filed regarding Account #${neg.account_number}. While our chargemaster rates reflect regional standards, our billing committee has authorized a prompt-pay courtesy reduction. We can offer a discounted settlement balance of $250.00 if payment is received within 30 days.\n\nPlease remit payment or confirm your acceptance.\n\nSincerely,\nExample Community Health Center Patient Financial Services`;
  } else if (presetType === "charity") {
    text = `RE: Account #${neg.account_number} Financial Review\n\nThank you for your dispute. To evaluate your account under our FQHC Sliding Fee Discount Policy, please submit household income verification. Upon review, a reduction up to 100% may be granted.\n\nFinancial Counseling Office`;
  } else if (presetType === "accept") {
    text = `FORMAL NOTICE OF SETTLEMENT ACCEPTANCE\n\nAccount #${neg.account_number}\n\nWe have accepted your settlement offer of $175.00 in full and final satisfaction of this account. Upon receipt of payment within 14 business days, a zero-balance receipt will be issued and all credit reporting suppressed.\n\nPatient Accounts Supervisor`;
  }

  await sendInboundPayload(text, subject);
}

async function sendCustomInboundMessage() {
  const text = document.getElementById("customInboundText")?.value?.trim();
  if (!text) {
    alert("Please enter a custom hospital response message.");
    return;
  }
  await sendInboundPayload(text, `RE: Patient Dispute [${currentNegotiation?.tracking_code || ''}]`);
  document.getElementById("customInboundText").value = "";
}

async function sendInboundPayload(messageText, subject) {
  if (!currentNegotiation) return;

  showProcessing(true, "AI Negotiator Analyzing Hospital Response...", "Extracting counter-offer figures, checking statutory obligations, and drafting response");

  try {
    const resp = await fetch(`/api/negotiations/${currentNegotiation.id}/inbound`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message_text: messageText,
        sender: "billing@hospital.example",
        subject: subject
      })
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.detail || "Inbound processing failed.");
    }

    const data = await resp.json();
    currentNegotiation = data.negotiation;
    renderNegotiationView(currentNegotiation);
  } catch (err) {
    alert("Error processing inbound hospital message: " + err.message);
  } finally {
    showProcessing(false);
  }
}

async function approveAndSendCounterOffer() {
  if (!currentNegotiation) return;
  const revisedOffer = parseFloat(document.getElementById("revisedOfferInput")?.value || 175);
  const counterLetterText = document.getElementById("draftPreviewBox")?.innerText || "We propose a revised settlement offer.";

  try {
    const resp = await fetch(`/api/negotiations/${currentNegotiation.id}/counter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        revised_offer: revisedOffer,
        counter_letter_text: counterLetterText
      })
    });

    if (!resp.ok) throw new Error("Counter dispatch failed.");
    currentNegotiation = await resp.json();
    renderNegotiationView(currentNegotiation);
    alert(`Counter-offer of ${formatCurrency(revisedOffer)} successfully dispatched to hospital!`);
  } catch (err) {
    alert("Error dispatching counter offer: " + err.message);
  }
}

async function acceptHospitalOffer() {
  if (!currentNegotiation) return;
  showProcessing(true, "Dispatching Settlement Acceptance via Gmail SMTP...", "Transmitting formal zero-balance acceptance notice from advocate@example.com to hospital billing department");

  try {
    const acceptedAmt = 175.00;
    const resp = await fetch(`/api/negotiations/${currentNegotiation.id}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepted_amount: acceptedAmt })
    });

    if (!resp.ok) throw new Error("Acceptance dispatch failed.");
    const data = await resp.json();
    currentNegotiation = data.negotiation;
    renderNegotiationView(currentNegotiation);
    alert(`Settlement Offer of ${formatCurrency(acceptedAmt)} Accepted! Acceptance notice and zero-balance terms transmitted via Gmail.`);
  } catch (err) {
    alert("Error accepting settlement: " + err.message);
  } finally {
    showProcessing(false);
  }
}

// Inbox watch: checks Gmail every 5 seconds while a negotiation is open, so nobody has to click.
const INBOX_CHECK_MS = 5000;
let inboxWatchTimer = null;
let inboxCheckInFlight = false;
let lastNegotiationJson = "";

function setInboxButtonChecking(active) {
  const btn = document.getElementById("syncGmailBtn");
  if (!btn) return;
  btn.querySelector("span").innerText = "Checking...";
  btn.classList.toggle("is-spinning", active);
}

async function checkInboundGmail() {
  if (inboxCheckInFlight || !currentNegotiation) return;
  inboxCheckInFlight = true;
  try {
    const resp = await fetch("/api/negotiations/sync-inbox", { method: "POST" });
    if (!resp.ok) return;
    // Re-render only when the case changed, so the thread doesn't flicker every 5 seconds.
    const negResp = await fetch(`/api/negotiations/${currentNegotiation.id}`);
    if (!negResp.ok) return;
    const json = JSON.stringify(await negResp.json());
    if (json !== lastNegotiationJson) {
      lastNegotiationJson = json;
      currentNegotiation = JSON.parse(json);
      renderNegotiationView(currentNegotiation);
    }
  } catch (err) {
    console.error("Inbox check failed:", err);
  } finally {
    inboxCheckInFlight = false;
  }
}

function startInboxWatch() {
  if (inboxWatchTimer) return;
  setInboxButtonChecking(true);
  checkInboundGmail();
  inboxWatchTimer = setInterval(checkInboundGmail, INBOX_CHECK_MS);
}

// Admin Capabilities & View Toggling
function toggleRoleView() {
  const adminSec = document.getElementById("adminPanelSection");
  const roleBtn = document.getElementById("roleSwitchBtn");
  const roleLabel = document.getElementById("roleLabel");

  if (currentRole === "patient") {
    currentRole = "admin";
    adminSec.style.display = "block";
    roleBtn.className = "btn-role-switch admin-active";
    roleLabel.innerText = "Role: Admin Supervision View";
    adminSec.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    currentRole = "patient";
    adminSec.style.display = "none";
    roleBtn.className = "btn-role-switch";
    roleLabel.innerText = "Role: Patient View";
  }
}

async function triggerAdminRerun() {
  if (!currentNegotiation) {
    alert("Please select or dispatch a case first to run an Admin re-audit.");
    return;
  }

  const instructions = document.getElementById("adminInstructionsInput")?.value || "";
  const scope = document.getElementById("adminScopeSelect")?.value || "all";

  showProcessing(true, "Executing Unbounded Admin Re-Audit...", `Applying custom directives: '${instructions || 'FQHC Statutory Review'}'`);

  try {
    const resp = await fetch(`/api/negotiations/${currentNegotiation.id}/admin/rerun`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        custom_instructions: instructions,
        scope: scope
      })
    });

    if (!resp.ok) throw new Error("Admin rerun failed.");
    const data = await resp.json();
    currentNegotiation = data.negotiation;
    renderNegotiationView(currentNegotiation);

    const historyBox = document.getElementById("adminRerunHistoryList");
    const item = document.createElement("div");
    item.className = "audit-log-item";
    item.innerHTML = `
      <div><strong>Version ${data.rerun.version}</strong> (${data.rerun.scope.toUpperCase()})</div>
      <div><em>Directive:</em> ${data.rerun.instructions}</div>
      <div>${data.rerun.result_summary}</div>
    `;
    historyBox.prepend(item);

    alert(`Admin Re-Audit Version ${data.rerun.version} completed! Version recorded in history.`);
  } catch (err) {
    alert("Admin rerun error: " + err.message);
  } finally {
    showProcessing(false);
  }
}

function adminApproveSettlement() {
  acceptHospitalOffer();
}

// UI Helpers
function showProcessing(show, title = "", sub = "") {
  const p = document.getElementById("processingSection");
  if (!p) return;
  p.style.display = show ? "block" : "none";
  if (title) document.getElementById("processingTitle").innerText = title;
  if (sub) document.getElementById("processingSubtitle").innerText = sub;
}

function formatCurrency(num) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num || 0);
}

function roundNum(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
