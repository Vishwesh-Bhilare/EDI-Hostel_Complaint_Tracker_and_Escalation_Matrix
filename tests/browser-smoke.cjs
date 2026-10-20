// End-to-end test against the real Java server and a disposable MySQL database.
// Requires Playwright (set NODE_PATH to its installation), Edge, MySQL and a JDK.
// No production reports are modified and no emails are sent.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const mysql = process.env.HOSTELCARE_MYSQL_EXE || 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe';
const java = process.env.HOSTELCARE_JAVA_EXE || 'C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\java.exe';
const source = fs.readFileSync(path.join(root, 'jdbc', 'DBConnection.java'), 'utf8');
const localFile = path.join(root, '.local', 'hostelcare.json');
const local = fs.existsSync(localFile) ? JSON.parse(fs.readFileSync(localFile, 'utf8')) : {};
const password = process.env.HOSTELCARE_DB_PASSWORD || local.HOSTELCARE_DB_PASSWORD || source.match(/envOrDefault\("HOSTELCARE_DB_PASSWORD", "([^"]*)"\)/)[1];
const user = process.env.HOSTELCARE_DB_USER || local.HOSTELCARE_DB_USER || 'root';
const database = `hostelcare_codex_ui_test_${process.pid}`;
const url = 'http://localhost:18765';
const sql = input => execFileSync(mysql, ['-h', 'localhost', '-P', '3306', '-u', user, '--batch', '--skip-column-names'],
  { input, encoding: 'utf8', windowsHide: true, env: { ...process.env, MYSQL_PWD: password } }).trim();
const date = d => {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

async function main() {
  let created = false, server, browser;
  const errors = [];
  try {
    assert.match(database, /^hostelcare_codex_ui_test_\d+$/);
    assert.equal(sql(`SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${database}';`), '0');
    sql(`CREATE DATABASE ${database};`);
    created = true;
    const schema = fs.readFileSync(path.join(root, 'mysql', 'schema.sql'), 'utf8')
      .replace('CREATE DATABASE IF NOT EXISTS hostelcare;', '')
      .replace('USE hostelcare;', `USE ${database};`);
    sql(schema);
    const migration = fs.readFileSync(path.join(root, 'mysql', 'migrate_complaint_groups.sql'), 'utf8')
      .replace('USE hostelcare;', `USE ${database};`);
    sql(migration + '\n' + migration); // also validate repeat execution on fresh schema
    const backgroundMigration = fs.readFileSync(path.join(root, 'mysql', 'migrate_background_notifications.sql'), 'utf8')
      .replace('USE hostelcare;', `USE ${database};`);
    sql(backgroundMigration + '\n' + backgroundMigration);
    const values = Array.from({ length: 23 }, (_, i) => {
      const category = i === 22 ? 'Food/Mess' : 'Cleanliness/Hygiene';
      const hostel = i >= 20 && i < 22 ? 'Godavari Girls Hostel' : 'Devgiri Boys Hostel';
      const level = i < 20 ? 3 : 0;
      return `('Washroom report ${i + 1}', '${category}', 'Medium', 'Shared facilities need cleaning.', 'Pending', 1, '${hostel}', ${level}, DATE_SUB(NOW(), INTERVAL 5 MINUTE), DATE_ADD(NOW(), INTERVAL 3 HOUR), DATE_ADD(NOW(), INTERVAL 3 HOUR), DATE_ADD(NOW(), INTERVAL 12 HOUR), DATE_ADD(NOW(), INTERVAL 24 HOUR))`;
    });
    sql(`USE ${database}; UPDATE users SET email=CONCAT('test-', id, '@replace-me.hostelcare.local');
      INSERT INTO complaints (title,category,severity,description,status,student_id,hostel_block,escalation_level,created_at,response_due_at,authority_response_due_at,resolution_due_at,final_due_at) VALUES ${values.join(',')};`);
    const classpath = [path.join(root, 'build'), path.join(root, 'jdbc', 'mysql-connector-j-26.7.0.jar')].join(path.delimiter);
    const serverEnv = { ...process.env,
        HOSTELCARE_DB_URL: `jdbc:mysql://localhost:3306/${database}?useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true`,
        HOSTELCARE_DB_USER: user, HOSTELCARE_DB_PASSWORD: password,
        HOSTELCARE_SMTP_USER: '', HOSTELCARE_SMTP_PASS: '', HOSTELCARE_SMTP_FROM: '' };
    const javaTests = ['tests/NotificationDispatcherTest.java', 'tests/SqlMigrationTest.java',
      'tests/JdbcPoolRegressionTest.java', 'ConcurrencyTest.java', 'JdbcPoolTest.java'];
    execFileSync(java.replace(/java(\.exe)?$/, 'javac$1'), ['-cp', classpath, '-d', path.join(root, 'build'), ...javaTests.map(file => path.join(root, file))],
      { cwd: root, windowsHide: true });
    console.log(execFileSync(java, ['-cp', classpath, 'SqlMigrationTest'], { cwd: root, windowsHide: true, encoding: 'utf8' }).trim());
    const migrationFiles = ['migrate_notifications.sql', 'migrate_complaint_groups.sql', 'migrate_background_notifications.sql'].map(name => path.join(root, 'mysql', name));
    const migrations = execFileSync(java, ['-cp', classpath, 'SqlMigration', ...migrationFiles, ...migrationFiles],
      { cwd: root, windowsHide: true, env: serverEnv, encoding: 'utf8' });
    assert.equal((migrations.match(/Applied /g) || []).length, 6);
    console.log('Java migrations passed twice using the backend connection settings and isolated database.');
    for (const test of ['JdbcPoolTest', 'JdbcPoolRegressionTest']) {
      console.log(execFileSync(java, ['-cp', classpath, test],
        { cwd: root, windowsHide: true, env: serverEnv, encoding: 'utf8', timeout: 30000 }).trim());
    }
    const mailTest = execFileSync(java, ['-cp', classpath, 'NotificationDispatcherTest'],
      { cwd: root, windowsHide: true, env: serverEnv, encoding: 'utf8' });
    console.log(mailTest.trim());
    server = spawn(java, ['-cp', classpath, 'TcpServer', '18765'],
      { cwd: root, windowsHide: true, stdio: 'pipe', env: { ...serverEnv, HOSTELCARE_DEBUG_REQUESTS: 'true' } });
    let serverOutput = '';
    server.stdout.on('data', data => { serverOutput += data.toString(); });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Java server startup timed out')), 10000);
      server.stdout.on('data', data => { if (data.toString().includes('listening on port')) { clearTimeout(timer); resolve(); } });
      server.once('error', reject);
      server.once('exit', code => { clearTimeout(timer); reject(new Error(`Java server exited ${code}`)); });
    });
    for (const [endpoint, mode] of [[url + '/', 'static'], [url + '/api', 'snapshot']]) {
      console.log(execFileSync(java, ['-cp', classpath, 'ConcurrencyTest', endpoint, '100', mode],
        { cwd: root, windowsHide: true, env: serverEnv, encoding: 'utf8', timeout: 30000 }).trim());
    }
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    const snapshotRequests = [];
    page.on('request', request => {
      if (request.url().endsWith('/api') && request.postDataJSON()?.action === 'snapshot') snapshotRequests.push(request.postDataJSON());
    });
    const loadStarted = Date.now();
    await page.goto(url);
    assert.equal((await page.request.get(`${url}/.local/hostelcare.json`)).status(), 404);
    assert.equal((await page.request.get(`${url}/.git/config`)).status(), 404);
    await page.locator('#loginBtn').waitFor();
    assert.equal(snapshotRequests.length, 1, 'startup should need only one database snapshot');
    console.log(`Welcome screen ready in ${Date.now() - loadStarted} ms (includes external CSS/fonts).`);
    const queueStarted = Date.now();
    const notification = await page.request.post(`${url}/api`, { data: { action: 'notify', complaintId: 1,
      role: 'student', to: 'test@example.invalid', subject: 'Queue API test', body: 'No SMTP configured; no email sent.' } });
    const queued = await notification.json();
    assert.equal(queued.delivery, 'queued');
    console.log(`Email acceptance API returned in ${Date.now() - queueStarted} ms.`);
    for (let attempt = 0; attempt < 30; attempt++) {
      if (sql(`SELECT status FROM ${database}.notifications WHERE id=${queued.notificationId};`) === 'failed') break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(sql(`SELECT status FROM ${database}.notifications WHERE id=${queued.notificationId};`), 'failed');
    await page.locator('#loginBtn').click();
    await page.locator('[data-login="6"]').click();
    await page.getByRole('heading', { name: 'Principal dashboard' }).waitFor();
    assert.equal(await page.locator('.issue-group').count(), 3);
    const group = () => page.locator('.issue-group').filter({ hasText: 'Devgiri Boys Hostel' }).filter({ hasText: 'Cleanliness/Hygiene' });
    assert.match(await group().innerText(), /20 open reports/);
    assert.match(await group().innerText(), /Default Medium/);
    assert.equal(await group().locator('details').getAttribute('open'), null);
    await group().locator('summary').click();
    await page.locator('[data-acknowledge="1"]').click();
    await page.waitForFunction(() => !document.querySelector('details[open]'));
    assert.equal(sql(`SELECT authority_acknowledged FROM ${database}.complaints WHERE id=1;`), '1');

    await page.locator('#logoutBtn').click();
    await page.locator('#loginBtn').click();
    await page.locator('[data-login="1"]').click();
    await page.locator('#newComplaintBtn').click();
    await page.locator('#ncTitle').fill('Another shared washroom complaint');
    await page.locator('#ncCategory').selectOption('Cleanliness/Hygiene');
    await page.locator('#ncDescription').fill('The common washroom still needs cleaning.');
    const submitStarted = Date.now();
    await page.locator('#ncSubmit').click();
    await page.getByText('Another shared washroom complaint', { exact: true }).waitFor();
    console.log(`21st complaint saved and screen updated in ${Date.now() - submitStarted} ms.`);
    assert.equal(sql(`SELECT COUNT(*) FROM ${database}.complaints WHERE category='Cleanliness/Hygiene' AND hostel_block='Devgiri Boys Hostel' AND severity='High';`), '21');

    await page.locator('#logoutBtn').click();
    await page.locator('#loginBtn').click();
    await page.locator('[data-login="6"]').click();
    assert.match(await group().innerText(), /21 open reports/);
    assert.match(await group().innerText(), /Default Medium → High/);
    if (await page.locator('html').getAttribute('data-theme') === 'dark') await page.locator('#themeToggle').click();
    const screenshotDir = process.env.HOSTELCARE_SCREENSHOT_DIR;
    if (screenshotDir) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDir, 'principal-groups-desktop.png'), fullPage: true });
    }
    await page.locator('#themeToggle').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile layout overflows');
    if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, 'principal-groups-mobile.png'), fullPage: true });
    await group().locator('summary').click();
    await page.locator('[data-principal-resolve="1"]').click();
    await page.waitForFunction(() => document.querySelector('.issue-group strong')?.textContent === '20');
    assert.equal(sql(`SELECT status FROM ${database}.complaints WHERE id=1;`), 'Resolved');
    assert.equal(sql(`SELECT severity FROM ${database}.complaints WHERE id=2;`), 'Medium');

    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.getByRole('button', { name: 'Issue groups', exact: true }).click();
    await page.locator('#pFilterSeverity').selectOption('Critical');
    await page.getByText('No issue groups match these filters.').waitFor();
    await page.locator('#pFilterSeverity').selectOption('all');
    await page.locator('#pFilterBlock').selectOption('Godavari Girls Hostel');
    assert.equal(await page.locator('.issue-group').count(), 1);
    assert.match(await page.locator('.issue-group').innerText(), /2 open reports/);

    // A deadline can be crossed between the 30s auto-sweeps. The student should
    // be able to use manual escalation during that window without a page reload.
    const due = date(new Date(Date.now() + 10000));
    sql(`USE ${database}; INSERT INTO complaints (title,category,severity,description,status,student_id,hostel_block,escalation_level,created_at,response_due_at,authority_response_due_at,resolution_due_at,final_due_at) VALUES ('Unanswered issue','Other','Medium','No authority response','Pending',1,'Devgiri Boys Hostel',0,NOW(),DATE_ADD(NOW(),INTERVAL 3 HOUR),'${due}',DATE_ADD(NOW(),INTERVAL 12 HOUR),DATE_ADD(NOW(),INTERVAL 24 HOUR));`);
    const unansweredId = sql(`SELECT MAX(id) FROM ${database}.complaints;`);
    await page.clock.install({ time: new Date() });
    await page.reload();
    await page.locator('#loginBtn').click();
    await page.locator('[data-login="1"]').click();
    const escalate = page.locator(`[data-student-escalate="${unansweredId}"]`);
    assert.equal(await escalate.isDisabled(), true);
    await page.clock.fastForward(15000);
    assert.equal(await escalate.isEnabled(), true, await page.evaluate(id => {
      const c = COMPLAINTS.find(c => c.id === id);
      return JSON.stringify({ now: new Date().toISOString(), due: c.authorityResponseDueAt?.toISOString(),
        level: c.escalationLevel, acknowledged: c.authorityAcknowledged, eligible: canStudentEscalate(c, currentUser.id) });
    }, unansweredId));
    page.once('dialog', dialog => dialog.accept('The authority missed its response deadline.'));
    await escalate.click();
    await page.waitForFunction(() => [...document.querySelectorAll('.complaint-row')].some(row => row.textContent.includes('Unanswered issue') && row.textContent.includes('Chief Warden')));
    assert.equal(sql(`SELECT escalation_level FROM ${database}.complaints WHERE id=${unansweredId};`), '1');
    assert.equal(sql(`SELECT triggered_by FROM ${database}.escalations WHERE complaint_id=${unansweredId};`), '1');
    await page.goto('file:///' + path.join(root, 'index.html').replace(/\\/g, '/'));
    await page.getByRole('heading', { name: 'Open the app through the Java server' }).waitFor();
    assert.deepEqual(errors, []);
    assert.match(serverOutput, /HTTP workers: 16; mail workers: 2; JDBC connections: 5/);
    const httpWorkers = new Set([...serverOutput.matchAll(/Request STARTED by: (hostelcare-http-\d+)/g)].map(match => match[1]));
    assert.equal(httpWorkers.size, 16, 'the integrated server must keep the 16-worker HTTP pool');
    console.log('Browser smoke passed: grouping, 21-report promotion, acknowledgement, resolution, filters, dark/mobile layout, and student overdue escalation.');
  } finally {
    if (browser) await browser.close();
    if (server && server.exitCode === null) {
      const exited = new Promise(resolve => server.once('exit', resolve));
      server.kill();
      await exited;
    }
    // Only this unique test database, which this process successfully created.
    if (created) sql(`DROP DATABASE ${database};`);
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
