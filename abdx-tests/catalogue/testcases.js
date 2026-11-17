// ABDX test catalogue: single source of truth for test cases.
// mode: parallel = runs in any worker; seed = runs serially right after reset, before mutating tests;
//       stateful = runs serially at the end (asserts global counters).
// source: Brief (testing brief), Live (observed on the live app 17 Nov 2026), AI Lens (AI Lens field report finding).
const C = [];
const tc = (id, module, title, pri, type, mode, source, data, steps, expected) =>
  C.push({ id, module, title, pri, type, mode, source, data, steps, expected });

// ---------- Authentication ----------
const M1 = 'Authentication';
tc('TC-AUTH-001', M1, 'Valid login lands on Dashboard', 'P1', 'UI', 'parallel', 'Brief', 'MASHREQCORP / Test@123',
  ['Open /login', 'Enter username and password', 'Click Login'], 'URL is /dashboard and tile-pending-approvals is visible');
tc('TC-AUTH-002', M1, 'Username is case-insensitive', 'P2', 'UI', 'parallel', 'Brief', 'mashreqcorp / Test@123',
  ['Open /login', 'Enter lowercase username and valid password', 'Click Login'], 'URL is /dashboard');
tc('TC-AUTH-003', M1, 'Wrong password shows exact error', 'P1', 'UI', 'parallel', 'Brief', 'MASHREQCORP / Wrong@123',
  ['Open /login', 'Enter valid username, wrong password', 'Click Login'], 'login-error = "Invalid username or password." and URL stays /login');
tc('TC-AUTH-004', M1, 'Unknown user shows exact error', 'P1', 'UI', 'parallel', 'Brief', 'NOUSER / Test@123',
  ['Open /login', 'Enter unknown username', 'Click Login'], 'login-error = "Invalid username or password."');
tc('TC-AUTH-005', M1, 'Empty credentials show exact error', 'P2', 'UI', 'parallel', 'Live', 'blank / blank',
  ['Open /login', 'Click Login without input'], 'login-error = "Invalid username or password."');
tc('TC-AUTH-006', M1, 'Password field is masked', 'P3', 'UI', 'parallel', 'Live', '-',
  ['Open /login', 'Inspect login-password'], 'Input type is "password"');
tc('TC-AUTH-007', M1, 'Top bar shows user, branch and party', 'P2', 'UI', 'parallel', 'Live', 'Logged in session',
  ['Login', 'Read top bar'], 'user-menu contains MASHREQCORP, topbar-branch = "Downtown Branch", topbar-party = "Athena Corporate Ltd"');
tc('TC-AUTH-008', M1, 'Logout returns to login', 'P1', 'UI', 'parallel', 'Brief', 'Logged in session',
  ['Login', 'Open user-menu', 'Click btn-logout'], 'URL is /login');
tc('TC-AUTH-009', M1, 'Protected route blocked after logout', 'P1', 'UI', 'parallel', 'Live', '-',
  ['Login then logout', 'Open /dashboard directly'], 'Redirected to /login');
tc('TC-AUTH-010', M1, 'Deep link without session redirects to login', 'P1', 'UI', 'parallel', 'Live', '-',
  ['With no session, open /approvals'], 'Redirected to /login');
tc('TC-AUTH-011', M1, 'Session survives page reload', 'P2', 'UI', 'parallel', 'Live', 'Logged in session',
  ['Login', 'Reload /dashboard'], 'Still on /dashboard with user-menu visible');
tc('TC-AUTH-012', M1, 'Root URL redirects unauthenticated user to login', 'P3', 'UI', 'parallel', 'Live', '-',
  ['With no session, open /'], 'Redirected to /login');

// ---------- Navigation and shell ----------
const M2 = 'Navigation & Shell';
tc('TC-NAV-001', M2, 'Drawer lists Accounts and Payments sections', 'P2', 'UI', 'parallel', 'Live', '-',
  ['Login', 'Read drawer'], 'Drawer contains ACCOUNTS, PAYMENTS, International Payment, Pre-Existing Deal (IBG), Payment Tracker, Drafts');
for (const [n, id, route] of [[2,'menu-item-dashboard','/dashboard'],[3,'menu-item-intl-payment','/payment/international'],[4,'menu-item-ibg-deal','/payment/ibg-deal'],[5,'menu-item-approvals','/approvals'],[6,'menu-item-drafts','/drafts']])
  tc(`TC-NAV-00${n}`, M2, `Menu ${id} navigates to ${route}`, 'P2', 'UI', 'parallel', 'Brief', '-',
    ['Login', 'Start on a different page', `Click ${id}`], `URL is ${route}`);
tc('TC-NAV-007', M2, 'Menu toggle collapses and restores the drawer', 'P3', 'UI', 'parallel', 'Brief', '-',
  ['Login', 'Click menu-toggle', 'Click menu-toggle again'], 'Drawer state changes on first click and returns to visible on second');
tc('TC-NAV-008', M2, 'Payments menu group has data-testid menu-item-payments', 'P3', 'UI', 'parallel', 'Brief', '-',
  ['Login', 'Locate menu-item-payments'], 'Element with data-testid menu-item-payments exists (listed in brief)');
tc('TC-NAV-009', M2, 'Unknown route shows a not-found page', 'P3', 'UI', 'parallel', 'AI Lens', '/no-such-page',
  ['Login', 'Open /no-such-page'], 'A not-found message is shown (app must not silently show Dashboard)');
const mock = [['/accounts/casa','Current & Savings Accounts'],['/accounts/deposits','Deposits'],['/accounts/loans','Loans & Finances'],['/payment/transfer','Transfer Money'],['/payees','Manage Payees'],['/file-upload','Bulk File Upload'],['/trade','Trade Finance'],['/cash-mgmt','Cash Management'],['/forex','Forex Deal'],['/reports','Reports'],['/settings','Account Setting']];
mock.forEach(([r, h], i) => tc(`TC-MOCK-${String(i+1).padStart(3,'0')}`, 'Mockup Screens', `${r} renders "${h}" inside the shell`, 'P3', 'UI', 'parallel', 'Brief', r,
  ['Login', `Open ${r}`], `HTTP 200, heading contains "${h}", drawer and user-menu visible`));
tc('TC-MOCK-012', 'Mockup Screens', 'CASA table matches seeded accounts', 'P2', 'UI', 'parallel', 'Brief', '1234567890, 9876543210, 5555000011',
  ['Login', 'Open /accounts/casa'], 'Rows show Operating Account USD 4,520,000.75; AED Collections AED 18,750,000.00; Payroll Account USD 980,000.00');
tc('TC-MOCK-013', 'Mockup Screens', 'Deposits table matches seeded accounts', 'P3', 'UI', 'parallel', 'Brief', '7001234567, 7009988776',
  ['Login', 'Open /accounts/deposits'], 'Fixed Deposit 12M USD 2,500,000.00 and Recurring Deposit AED 600,000.00 shown');
tc('TC-MOCK-014', 'Mockup Screens', 'Loans table shows Term Loan Facility', 'P3', 'UI', 'parallel', 'Brief', '8001112223',
  ['Login', 'Open /accounts/loans'], 'Term Loan Facility USD with balance 3,200,000.00 (negative) shown');

// ---------- Dashboard ----------
const M3 = 'Dashboard';
tc('TC-DASH-001', M3, 'Pending count matches backend pending transactions', 'P1', 'UI+API', 'stateful', 'Brief', '-',
  ['Login', 'Read pending-count', 'GET /api/transactions?status=Pending Approval'], 'pending-count equals number of Pending Approval rows from API');
tc('TC-DASH-002', M3, 'Payment Tracker mini shows ref, beneficiary, amount, status', 'P2', 'UI', 'parallel', 'Brief', '-',
  ['Login', 'Read dashboard-tracker'], 'Headers REFERENCE, BENEFICIARY, AMOUNT, STATUS and at least one row with CBP/IBG ref');
tc('TC-DASH-003', M3, 'Pending count increments after a new submission', 'P1', 'UI+API', 'stateful', 'Brief', 'USD 1,000 adhoc payment',
  ['Read pending-count', 'Submit a Cross-Border payment', 'Return to Dashboard'], 'pending-count increases by 1');
tc('TC-DASH-004', M3, 'Pending count decrements after approval', 'P1', 'UI+API', 'stateful', 'Brief', 'Payment from DASH-003',
  ['Read pending-count', 'Approve the payment in Approvals', 'Return to Dashboard'], 'pending-count decreases by 1');
tc('TC-DASH-005', M3, 'Pending tile "Open Payment Tracker" opens Approvals', 'P2', 'UI', 'parallel', 'Live', '-',
  ['Login', 'Click "Open Payment Tracker" on tile-pending-approvals'], 'URL is /approvals');
tc('TC-DASH-006', M3, 'Notifications bell opens a panel', 'P3', 'UI', 'parallel', 'AI Lens', '-',
  ['Login', 'Click topbar-notifications'], 'A notifications panel or list becomes visible');

// ---------- Routing labels ----------
const M4 = 'Routing Labels';
[['US','Fedwire Code'],['CA','Sort Code'],['GB','Sort Code'],['NZ','Sort Code'],['IN','IFSC Code'],['AU','BSB Code']].forEach(([c, l], i) =>
  tc(`TC-RL-00${i+1}`, M4, `Country ${c} sets label "${l}"`, 'P1', 'UI', 'parallel', 'Brief', c,
    ['Open /payment/international', `Select bene-country ${c}`], `routing-code-label = "${l}"`));
tc('TC-RL-007', M4, 'Default label before country selected', 'P3', 'UI', 'parallel', 'Live', '-',
  ['Open /payment/international'], 'routing-code-label = "Routing Code"');
tc('TC-RL-008', M4, 'Label follows repeated country changes', 'P2', 'UI', 'parallel', 'Brief', 'US -> IN -> AU -> GB',
  ['Select US, IN, AU, GB in turn'], 'Label is Fedwire Code, IFSC Code, BSB Code, Sort Code in turn');

// ---------- Accuity lookup (UI) ----------
const M5 = 'Accuity Lookup';
const acc = [['US','021000021','JPMorgan Chase','New York, NY','CHASUS33'],['US','026009593','Bank of America','New York, NY','BOFAUS3N'],['IN','HDFC0000123','HDFC Bank','Mumbai','HDFCINBB'],['IN','ICIC0000456','ICICI Bank','Mumbai','ICICINBB'],['GB','20-00-00','Barclays','London','BARCGB22'],['GB','40-05-15','HSBC','London','HBUKGB4B'],['CA','000300','Royal Bank of Canada','Toronto','ROYCCAT2'],['NZ','010000','ANZ Bank','Auckland','ANZBNZ22'],['AU','062-000','Commonwealth Bank','Sydney','CTBAAU2S'],['AU','082-001','NAB','Melbourne','NATAAU33']];
acc.forEach(([c, code, bank, addr, bic], i) => tc(`TC-ACC-${String(i+1).padStart(3,'0')}`, M5, `${c} ${code} autofills ${bank}`, i < 3 ? 'P1' : 'P2', 'UI', 'parallel', 'Brief', `${c} / ${code}`,
  ['Open /payment/international', `Select ${c}`, `Enter routing code ${code}`, 'Tab out'], `bank-name = "${bank}", bank-address = "${addr}", swift-bic = "${bic}", no routing-error`));
[['011','US','000000'],['012','US','999'],['013','GB','12-34-56'],['014','GB','021000021']].forEach(([n, c, code]) =>
  tc(`TC-ACC-${n}`, M5, `${n === '014' ? 'Valid code with wrong country' : 'Invalid code'} ${c} ${code} rejected`, 'P1', 'UI', 'parallel', 'Brief', `${c} / ${code}`,
    ['Open /payment/international', `Select ${c}`, `Enter ${code}`, 'Tab out'], 'routing-error = "Routing Code not present or invalid." and bank-name empty'));
tc('TC-ACC-015', M5, 'Correcting an invalid code clears the error', 'P2', 'UI', 'parallel', 'AI Lens', 'US 000000 then 021000021',
  ['Enter invalid code', 'Replace with valid code'], 'routing-error disappears and bank fields autofill');
tc('TC-ACC-016', M5, 'Bank name, address and BIC are read-only', 'P2', 'UI', 'parallel', 'Live', '-',
  ['Open /payment/international'], 'bank-name, bank-address, swift-bic are readonly');
tc('TC-ACC-017', M5, 'Invalid code after valid one clears bank fields', 'P2', 'UI', 'parallel', 'Live', 'US 021000021 then 000000',
  ['Enter valid code', 'Replace with invalid code'], 'bank-name, swift-bic become empty and routing-error is shown');

// ---------- Cross-Border validation ----------
const M6 = 'Cross-Border Validation';
tc('TC-VAL-001', M6, 'Empty form shows every required error', 'P1', 'UI', 'parallel', 'Brief', '-',
  ['Open /payment/international', 'Click Continue to Review'], 'error-bene-name, error-bene-account, error-country, error-amount, error-currency and routing-error show their exact texts; URL unchanged');
const vf = [['002','bene-name','error-bene-name','Beneficiary Name is required.'],['003','bene-account','error-bene-account','Beneficiary Account / IBAN is required.'],['004','bene-country','error-country','Beneficiary Bank Country is required.'],['005','currency','error-currency','Transfer Currency is required.']];
vf.forEach(([n, f, e, msg]) => tc(`TC-VAL-${n}`, M6, `Only ${f} missing shows its error`, 'P2', 'UI', 'parallel', 'Brief', 'All other fields valid',
  ['Fill a valid payment', `Leave ${f} empty`, 'Click Continue'], `${e} = "${msg}" and no navigation to review`));
tc('TC-VAL-006', M6, 'Amount 0 rejected', 'P1', 'UI', 'parallel', 'Brief', 'amount 0',
  ['Fill valid payment with amount 0', 'Continue'], 'error-amount = "Transfer Amount must be a number greater than 0."');
tc('TC-VAL-007', M6, 'Negative amount rejected', 'P1', 'UI', 'parallel', 'AI Lens', 'amount -5',
  ['Fill valid payment with amount -5', 'Continue'], 'error-amount = "Transfer Amount must be a number greater than 0."');
tc('TC-VAL-008', M6, 'Smallest positive amount 0.01 accepted', 'P3', 'UI', 'parallel', 'AI Lens', 'amount 0.01',
  ['Fill valid payment with amount 0.01', 'Continue'], 'Navigates to /payment/review');
tc('TC-VAL-009', M6, 'Errors clear once corrected and review opens', 'P2', 'UI', 'parallel', 'AI Lens', '-',
  ['Click Continue on empty form', 'Fill all fields validly', 'Continue'], 'No error-* elements remain and URL is /payment/review');
tc('TC-VAL-010', M6, 'Beneficiary name rejects markup', 'P3', 'UI', 'parallel', 'AI Lens', '<script>alert(1)</script>',
  ['Enter markup as beneficiary name', 'Continue'], 'Input rejected with a validation message (no navigation to review)');

// ---------- Cross-Border end to end ----------
const M7 = 'Cross-Border Payment';
tc('TC-CBP-001', M7, 'Adhoc US payment reaches review with derived intermediary', 'P1', 'UI', 'parallel', 'Brief', 'US 021000021 USD 40000, intermediary blank',
  ['Fill adhoc payment', 'Continue'], 'URL /payment/review, review-bene-name matches, review-intermediary-bic = "CITIUS33", review-amount = "40000 USD"');
tc('TC-CBP-002', M7, 'Submit for approval shows success with CBP ref', 'P1', 'UI', 'parallel', 'Brief', 'As CBP-001',
  ['Complete review', 'Submit for Approval'], 'success-message = "Payment Submitted for Approval", txn-ref matches ^CBP\\d{10}$, txn-status = "Pending Approval"');
tc('TC-CBP-003', M7, 'View Transaction opens tracker with the new row', 'P1', 'UI', 'parallel', 'Brief', 'Ref from CBP-002',
  ['On success page click btn-view-transaction'], 'URL /approvals and a txn-row with the captured ref exists, status Pending Approval');
tc('TC-CBP-004', M7, 'Approving the new payment marks it Processed', 'P1', 'UI', 'parallel', 'Brief', 'Ref from submission',
  ['In Approvals click btn-approve on the new row'], 'Row txn-status = "Processed" and btn-approve no longer present');
[['005','EUR','DEUTDEFF'],['006','GBP','HSBCGB2L'],['007','AED','ATHNAEAD'],['008','INR','SBININBB']].forEach(([n, ccy, bic]) =>
  tc(`TC-CBP-${n}`, M7, `Blank intermediary derives ${bic} for ${ccy}`, 'P2', 'UI', 'parallel', 'Brief', `${ccy}, intermediary blank`,
    ['Fill adhoc payment', `Choose currency ${ccy}`, 'Continue'], `review-intermediary-bic = "${bic}"`));
tc('TC-CBP-009', M7, 'User-entered intermediary BIC is kept', 'P2', 'UI', 'parallel', 'Live', 'intermediary BNPAFRPP',
  ['Fill payment with intermediary BNPAFRPP', 'Continue'], 'review-intermediary-bic = "BNPAFRPP"');
tc('TC-CBP-010', M7, 'Back from review keeps entered values', 'P2', 'UI', 'parallel', 'Live', '-',
  ['Reach review', 'Click btn-back'], 'Initiate screen shows same name, account, amount and currency');
tc('TC-CBP-011', M7, 'Review shows every entered detail', 'P2', 'UI', 'parallel', 'Live', 'IN HDFC0000123 INR, pay via Wire, remarks',
  ['Fill payment', 'Continue'], 'Review shows account, country, IFSC Code label and code, HDFC Bank, HDFCINBB, Wire and remarks');
tc('TC-CBP-012', M7, 'Pay Via offers SWIFT, Wire, Correspondent', 'P3', 'UI', 'parallel', 'Live', '-',
  ['Open initiate screen', 'Read pay-via options'], 'Options are exactly SWIFT, Wire, Correspondent; default SWIFT');
tc('TC-CBP-013', M7, 'Submitted payment is stored with the entered fields', 'P1', 'UI+API', 'parallel', 'Brief', 'GB 40-05-15 GBP 1234.5 Correspondent',
  ['Submit payment via UI', 'GET /api/transactions?status=All'], 'Row with captured ref has the same beneficiary, amount, currency, bank, SWIFT, payVia');
tc('TC-CBP-014', M7, 'Two submissions get different reference numbers', 'P2', 'UI', 'parallel', 'Brief', 'Two payments',
  ['Submit two payments'], 'Both refs match ^CBP\\d{10}$ and differ');

// ---------- Saved beneficiary ----------
const M8 = 'Saved Beneficiary';
tc('TC-SB-001', M8, 'Saved list shows seeded beneficiaries', 'P2', 'UI', 'parallel', 'Brief', '-',
  ['Choose bene-type-saved', 'Read saved-bene-select'], 'Options include "ACME Trading LLC (GB)" and "Global Imports Inc (US)"');
tc('TC-SB-002', M8, 'ACME Trading LLC prefills GB / Barclays', 'P1', 'UI', 'parallel', 'Brief', 'ACME Trading LLC',
  ['Choose saved', 'Select ACME Trading LLC'], 'bene-account DE89370400440532013000, country GB, routing 20-00-00, Sort Code label, Barclays, London, BARCGB22');
tc('TC-SB-003', M8, 'Global Imports Inc prefills US / JPMorgan', 'P2', 'UI', 'parallel', 'Brief', 'Global Imports Inc',
  ['Choose saved', 'Select Global Imports Inc'], 'bene-account US1234567890, country US, Fedwire Code, 021000021, JPMorgan Chase, CHASUS33');
tc('TC-SB-004', M8, 'Prefilled saved fields are read-only', 'P2', 'UI', 'parallel', 'Live', 'ACME Trading LLC',
  ['Select saved beneficiary'], 'bene-name, bene-account, routing-code are read-only or disabled');
tc('TC-SB-005', M8, 'Saved beneficiary end to end creates CBP ref', 'P1', 'UI', 'parallel', 'Brief', 'ACME, GBP 500',
  ['Select ACME', 'Amount 500 GBP', 'Continue', 'Submit'], 'Review shows HSBCGB2L intermediary; success ref ^CBP\\d{10}$');
tc('TC-SB-006', M8, 'Switching back to adhoc clears saved values', 'P2', 'UI', 'parallel', 'AI Lens', 'ACME then adhoc',
  ['Select ACME', 'Choose bene-type-adhoc'], 'bene-name and bene-account are empty and editable');

// ---------- Drafts ----------
const M9 = 'Drafts';
tc('TC-DR-001', M9, 'Seeded Sunrise Textiles draft present after reset', 'P1', 'UI', 'seed', 'Brief', '-',
  ['Reset', 'Open /drafts'], 'A draft-row contains "Sunrise Textiles Ltd" and "GBP 25000"');
tc('TC-DR-002', M9, 'Save as Draft shows toast', 'P1', 'UI', 'parallel', 'Brief', 'Partial adhoc form',
  ['Fill some fields', 'Click btn-save-draft'], 'draft-toast visible with "Draft saved."');
tc('TC-DR-003', M9, 'Saved draft listed with label', 'P1', 'UI', 'parallel', 'Live', 'Unique name, INR 123',
  ['Save draft', 'Open /drafts'], 'draft-row with "<name> — INR 123" exists');
tc('TC-DR-004', M9, 'Open draft repopulates every field', 'P1', 'UI', 'parallel', 'Brief', 'IN HDFC0000123 INR 123 Wire remarks',
  ['Save full draft', 'Open it from /drafts'], 'URL has ?draft=<id>; every field incl. label IFSC Code, HDFC Bank, HDFCINBB, pay-via, remarks restored');
tc('TC-DR-005', M9, 'Delete removes the draft row', 'P1', 'UI', 'parallel', 'Brief', 'Own draft',
  ['Save draft', 'Delete it in /drafts'], 'Row no longer present after reload');
tc('TC-DR-006', M9, 'Delete asks for confirmation', 'P3', 'UI', 'parallel', 'AI Lens', 'Own draft',
  ['Click btn-delete-draft'], 'A confirmation dialog is shown before deletion');
tc('TC-DR-007', M9, 'Seeded draft opens with GB / HSBC values', 'P2', 'UI', 'parallel', 'Brief', 'Sunrise Textiles Ltd',
  ['Open Sunrise draft'], 'bene-name Sunrise Textiles Ltd, GB, 40-05-15, HSBC, HBUKGB4B, GBP, 25000');
tc('TC-DR-008', M9, 'Opened draft can be submitted', 'P2', 'UI', 'parallel', 'Live', 'Own draft',
  ['Open own complete draft', 'Continue', 'Submit'], 'Success with ^CBP\\d{10}$ ref');

// ---------- Approvals ----------
const M10 = 'Approvals & Tracker';
tc('TC-APR-001', M10, 'Seeded transactions have expected status', 'P1', 'UI', 'seed', 'Brief', 'CBP1000000001, CBP2000000002',
  ['Reset', 'Open /approvals'], 'CBP1000000001 Pending Approval; CBP2000000002 Processed');
tc('TC-APR-002', M10, 'Filter Pending Approval shows only pending', 'P1', 'UI', 'parallel', 'Brief', '-',
  ['Select status-filter Pending Approval'], 'Every visible txn-status = Pending Approval');
tc('TC-APR-003', M10, 'Filter Processed shows only processed', 'P1', 'UI', 'parallel', 'Brief', '-',
  ['Select status-filter Processed'], 'Every visible txn-status = Processed and CBP2000000002 present');
tc('TC-APR-004', M10, 'Filter All shows both statuses', 'P2', 'UI', 'parallel', 'Brief', '-',
  ['Select status-filter All'], 'Both Pending Approval and Processed rows visible');
tc('TC-APR-005', M10, 'Approve shown only on pending rows', 'P2', 'UI', 'parallel', 'Live', '-',
  ['Open /approvals'], 'Processed rows have no btn-approve; every row has btn-download');
tc('TC-APR-006', M10, 'Download returns the row as JSON', 'P1', 'UI', 'parallel', 'Brief', 'CBP2000000002',
  ['Click btn-download on CBP2000000002'], 'File CBP2000000002.json downloaded; JSON refNumber, amount 42000, currency USD, status Processed');
tc('TC-APR-007', M10, 'Tracker columns are complete', 'P3', 'UI', 'parallel', 'Live', '-',
  ['Read txn-table headers'], 'REFERENCE NUMBER, BENEFICIARY NAME, AMOUNT, CURRENCY, COUNTRY, STATUS, CREATED ON, ACTIONS');
tc('TC-APR-008', M10, 'Approved payment moves to Processed filter', 'P2', 'UI', 'parallel', 'Brief', 'Own payment',
  ['Create payment (API)', 'Approve in UI', 'Filter Processed'], 'Ref visible under Processed and absent under Pending Approval');

// ---------- IBG deal ----------
const M11 = 'IBG Pre-Existing Deal';
tc('TC-IBG-001', M11, 'Screen loads with accounts and internal beneficiaries', 'P2', 'UI', 'parallel', 'Brief', '-',
  ['Open /payment/ibg-deal'], 'from-account lists 1234567890 and 9876543210; ibg-beneficiary lists Athena Subsidiary FZE and Athena Logistics DMCC');
tc('TC-IBG-002', M11, 'Empty submit shows all IBG errors', 'P1', 'UI', 'parallel', 'Brief', '-',
  ['Click Continue on empty form'], 'error-from-account, error-deal-id, error-deal-rate, error-amount, error-currency show exact texts');
tc('TC-IBG-003', M11, 'Missing Deal ID only', 'P2', 'UI', 'parallel', 'Brief', 'All but deal ID',
  ['Fill all except deal-id', 'Continue'], 'error-deal-id = "Deal ID is required."');
tc('TC-IBG-004', M11, 'Missing From Account only', 'P2', 'UI', 'parallel', 'Brief', 'All but from account',
  ['Fill all except from-account', 'Continue'], 'error-from-account = "From Account is required."');
tc('TC-IBG-005', M11, 'Deal rate 0 rejected', 'P2', 'UI', 'parallel', 'Brief', 'rate 0',
  ['Fill valid deal with rate 0', 'Continue'], 'error-deal-rate = "Deal Rate must be a number greater than 0."');
tc('TC-IBG-006', M11, 'Negative deal rate rejected', 'P2', 'UI', 'parallel', 'Live', 'rate -1',
  ['Fill valid deal with rate -1', 'Continue'], 'error-deal-rate = "Deal Rate must be a number greater than 0."');
tc('TC-IBG-007', M11, 'Calc on Debit Account Currency', 'P1', 'UI', 'parallel', 'Brief', 'From USD 1234567890, DEAL001, 3.67, AED 1000',
  ['Fill deal', 'Rate Applied = Debit Account Currency'], 'calculated-amount = 272.48 and deal-rate-line = "1 USD = 3.67 AED"');
tc('TC-IBG-008', M11, 'Calc on Transfer Amount Currency', 'P1', 'UI', 'parallel', 'Brief', 'As IBG-007',
  ['Switch Rate Applied to Transfer Amount Currency'], 'calculated-amount = 3670 and deal-rate-line = "1 USD = 3.67 AED"');
tc('TC-IBG-009', M11, 'Calculated amount shows a currency', 'P3', 'UI', 'parallel', 'AI Lens', 'As IBG-007',
  ['Fill deal', 'Read calculated-amount'], 'Calculated amount includes its currency code');
tc('TC-IBG-010', M11, 'Review shows all deal details', 'P2', 'UI', 'parallel', 'Live', 'As IBG-007 + expiry 2027-12-31, John Smith',
  ['Continue'], 'Review lists From Account, beneficiary, DEAL001, 2027-12-31, John Smith, rate 3.67, amount, calculated amount, rate line');
tc('TC-IBG-011', M11, 'Back from review keeps deal values', 'P3', 'UI', 'parallel', 'Live', '-',
  ['Continue', 'Click btn-back'], 'deal-id still DEAL001 and amount 1000');
tc('TC-IBG-012', M11, 'Submit IBG creates IBG ref', 'P1', 'UI', 'parallel', 'Brief', 'As IBG-010',
  ['Continue', 'Submit for Approval'], 'txn-ref matches ^IBG\\d{10}$; txn-status Pending Approval');
tc('TC-IBG-013', M11, 'IBG payment visible and approvable in tracker', 'P2', 'UI', 'parallel', 'Brief', 'Ref from submission',
  ['Open /approvals', 'Approve IBG row'], 'Row present then status Processed');
tc('TC-IBG-014', M11, 'Expired deal expiry rejected', 'P2', 'UI', 'parallel', 'AI Lens', 'expiry 2020-01-01',
  ['Fill deal with past expiry', 'Continue'], 'A validation error blocks review');

// ---------- Persistence ----------
const M12 = 'Persistence';
tc('TC-PER-001', M12, 'Payment visible after reload', 'P1', 'UI', 'parallel', 'Brief', 'Own payment',
  ['Submit payment', 'Reload /approvals'], 'Row with captured ref still present');
tc('TC-PER-002', M12, 'Payment visible from a fresh browser session', 'P1', 'UI', 'parallel', 'Brief', 'Own payment',
  ['Submit payment', 'New browser context, login', 'Open /approvals'], 'Row with captured ref present');
tc('TC-PER-003', M12, 'Draft visible from a fresh browser session', 'P2', 'UI', 'parallel', 'Brief', 'Own draft',
  ['Save draft', 'New context, login', 'Open /drafts'], 'Draft row present');

// ---------- API contract ----------
const M13 = 'API Contract';
const api = [
 ['001','GET /api/health','{ok:true, service:"abdx-backend", db:"up"}','P1'],
 ['002','POST /api/auth/login valid','200 with token, userId, username MASHREQCORP, partyName, branchName','P1'],
 ['003','POST /api/auth/login invalid','401 {error:"Invalid username or password."}','P1'],
 ['004','GET /api/accuity all 10 seeded codes','200 with exact bankName, bankAddress, swiftBic for each','P1'],
 ['005','GET /api/accuity invalid code','404 {error:"Routing Code not present or invalid."}','P1'],
 ['006','GET /api/accuity valid code wrong country','404 with the same exact error','P2'],
 ['007','GET /api/accuity/intermediary all 5 currencies','USD CITIUS33, EUR DEUTDEFF, GBP HSBCGB2L, AED ATHNAEAD, INR SBININBB','P1'],
 ['008','GET /api/deal-calc Debit Account Currency','calculatedAmount 272.48, formattedRate "1 USD = 3.67 AED" (debit USD, transfer AED)','P1'],
 ['009','GET /api/deal-calc Transfer Amount Currency','calculatedAmount 3670','P2'],
 ['010','GET /api/beneficiaries?kind=CROSS_BORDER','ACME Trading LLC and Global Imports Inc with seeded details','P2'],
 ['011','GET /api/beneficiaries?kind=INTERNAL','Athena Subsidiary FZE and Athena Logistics DMCC, AED','P2'],
 ['012','POST /api/transactions then approve','ref ^CBP\\d{10}$, status Pending Approval; approve gives Processed','P1'],
 ['013','GET /api/transactions?status=Pending Approval','Only Pending Approval rows returned','P2'],
 ['014','Drafts CRUD','POST creates, GET :id returns, DELETE removes, GET :id then 404','P1'],
 ['015','GET /api/transactions/:id/download','JSON of the row with matching refNumber','P2'],
 ['016','POST /api/auth/logout','2xx response','P3'],
];
api.forEach(([n, t, e, p]) => tc(`TC-API-${n}`, M13, t, p, 'API', 'parallel', 'Brief', '-', [`Call ${t.split(' ').slice(0,2).join(' ')}`], e));
tc('TC-API-017', M13, 'POST /api/reset response shape', 'P1', 'API', 'seed', 'Brief', '-',
  ['POST /api/reset'], '{ok:true, resetAt:<ISO timestamp>}; afterwards seeds restored');

// ---------- Security and robustness (from AI Lens findings) ----------
const M14 = 'Security & Robustness';
tc('TC-SEC-001', M14, 'Transactions API rejects calls without a token', 'P1', 'API', 'parallel', 'AI Lens', 'No Authorization header',
  ['GET /api/transactions?status=All with no token'], '401 or 403');
tc('TC-SEC-002', M14, 'Drafts and beneficiaries APIs reject calls without a token', 'P1', 'API', 'parallel', 'AI Lens', 'No token',
  ['GET /api/drafts', 'GET /api/beneficiaries?kind=CROSS_BORDER'], '401 or 403 for both');
tc('TC-SEC-003', M14, 'Logout clears payment form data from sessionStorage', 'P2', 'UI', 'parallel', 'AI Lens', 'Partially filled form',
  ['Fill bene name', 'Logout', 'Inspect sessionStorage and log back in'], 'No beneficiary data remains; initiate form is empty');
tc('TC-SEC-004', M14, 'Corporate Maker is not offered Approve', 'P2', 'UI', 'parallel', 'AI Lens', 'MASHREQCORP (role Corporate Maker)',
  ['Open /approvals as maker'], 'btn-approve not shown to a maker (segregation of duties)');
tc('TC-SEC-005', M14, 'Transfer Money Continue does something', 'P3', 'UI', 'parallel', 'AI Lens', '/payment/transfer',
  ['Open /payment/transfer', 'Fill amount', 'Click Continue'], 'Navigates to a review step or shows validation');
tc('TC-SEC-006', M14, 'No horizontal scroll at phone width', 'P3', 'UI', 'parallel', 'AI Lens', '390x844 viewport',
  ['Open /dashboard and /payment/international at 390px'], 'document scrollWidth <= viewport width');
tc('TC-SEC-007', M14, 'Canada and New Zealand use correct routing terms', 'P3', 'UI', 'parallel', 'AI Lens', 'CA, NZ',
  ['Select CA then NZ'], 'CA shows Transit Number (or Institution/Transit), NZ shows Bank Code, not "Sort Code" (banking accuracy)');
tc('TC-SEC-008', M14, 'Saved GB payee has a GB IBAN', 'P3', 'API', 'parallel', 'AI Lens', 'ACME Trading LLC',
  ['GET /api/beneficiaries?kind=CROSS_BORDER'], 'ACME (country GB) IBAN starts with GB');

module.exports = C;
if (require.main === module) {
  const by = {}; C.forEach(c => by[c.module] = (by[c.module] || 0) + 1);
  console.log('Total', C.length, by, 'dupes', C.length - new Set(C.map(c => c.id)).size);
}
