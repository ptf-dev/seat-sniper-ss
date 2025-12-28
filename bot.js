const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');

let browser = null;
let page = null;
let isRunning = false;
let config = {};
let stats = { // Added stats object
    startTime: null,
    checks: 0,
    errors: 0,
    tixFound: 0
};

async function start(conf, onLog, onStatus) {
    if (isRunning) return;
    isRunning = true;
    config = conf;
    // Reset stats
    stats = {
        startTime: new Date(),
        checks: 0,
        errors: 0,
        tixFound: 0
    };

    onStatus('running');

    // Send Start Notification
    try {
        await sendEmail(config.email, config.password, {
            subject: '🚀 Ticket Sniper Started',
            text: `Bot started monitoring ${config.url}`,
            html: `
                <div style="font-family: sans-serif; padding: 20px; background: #eff6ff; border-radius: 10px;">
                    <h2 style="color: #1e40af;">Bot Started 🚀</h2>
                    <p>Monitoring has successfully started.</p>
                    <p><strong>Target:</strong> <a href="${config.url}">${config.url}</a></p>
                    <p><strong>Time:</strong> ${stats.startTime.toLocaleString()}</p>
                    <p>You will be notified immediately if tickets are found.</p>
                </div>
            `
        });
        onLog({ message: `Start email sent to ${config.email}`, type: 'success' });
    } catch (err) {
        onLog({ message: `Failed to send start email: ${err.message}`, type: 'warn' });
    }

    try {
        onLog({ message: 'Launching browser...', type: 'info' });
        browser = await puppeteer.launch({
            headless: 'new', // Use new headless mode
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-features=site-per-process']
        });

        page = await browser.newPage();

        // Anti-bot detection mitigation (basic)
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 800 });

        onLog({ message: `Navigating to ${config.url}`, type: 'info' });

        // Initial navigation
        await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Start polling loop
        monitorLoop(onLog);

    } catch (error) {
        onLog({ message: `Error starting: ${error.message}`, type: 'error' });
        stop(onStatus);
    }
}

async function monitorLoop(onLog) {
    let checkCount = 0;

    // Set up response listener once
    page.on('response', async targetResponse => {
        const request = targetResponse.request();
        if (request.url().includes('/availability') && request.method() === 'GET') {
            try {
                const json = await targetResponse.json();
                // Check if seats or generalAdmissions are available
                const hasSeats = json.seats && json.seats.length > 0;
                const hasGA = json.generalAdmissions && json.generalAdmissions.length > 0; // Standing/GA tickets

                if (hasSeats || hasGA) {
                    stats.tixFound++;
                    onLog({ message: '!!! TICKETS FOUND !!!', type: 'success' });

                    // 1. Send Email Notification
                    try {
                        await sendEmail(config.email, config.password, {
                            subject: '🎟️ TICKETS AVAILABLE! - BVB Sniper',
                            text: `Tickets detected! Go now: ${config.url}`,
                            html: `
                                <div style="font-family: sans-serif; padding: 20px; background: #f0fdf4; border-radius: 10px;">
                                    <h1 style="color: #166534;">Tickets Found!</h1>
                                    <p>The monitoring bot has detected available tickets.</p>
                                    <a href="${config.url}" style="display: inline-block; padding: 12px 24px; background: #16a34a; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Check Now</a>
                                    <p style="margin-top: 20px; font-size: 12px; color: #666;">Timestamp: ${new Date().toLocaleString()}</p>
                                </div>
                            `
                        });
                        onLog({ message: 'Email sent successfully!', type: 'success' });
                    } catch (emailErr) {
                        onLog({ message: `Failed to send email: ${emailErr.message}`, type: 'error' });
                    }

                    // 2. Attempt to add to cart (Best Effort)
                    try {
                        onLog({ message: 'Attempting to add to cart...', type: 'info' });

                        // Bring browser to front/focus if possible (mostly for local dev)
                        await page.bringToFront();

                        // Logic for General Admission (usually a list)
                        if (hasGA) {
                            // Look for "plus" buttons or "Add" buttons
                            const added = await page.evaluate(() => {
                                // Eventim generic selectors
                                const buttons = Array.from(document.querySelectorAll('button, .ticket-type-add'));
                                const addBtn = buttons.find(b => b.innerText.includes('+') || b.innerText.toLowerCase().includes('add') || b.innerText.includes('Warenkorb'));
                                if (addBtn) {
                                    addBtn.click();
                                    return true;
                                }
                                return false;
                            });
                            if (added) onLog({ message: 'Clicked generic add button', type: 'success' });
                        }

                        // Logic for Seats (Seatmap)
                        // This is very hard to click blindly on a canvas/svg, but we can try to find an "Auto Select" or "Best Seat" button
                        const bestSeatBtn = await page.$('button[data-tt-name="best-seat"], .best-seat-btn');
                        if (bestSeatBtn) {
                            await bestSeatBtn.click();
                            onLog({ message: 'Clicked Best Seat button', type: 'success' });
                        }

                    } catch (cartErr) {
                        onLog({ message: `Auto-cart functionality failed: ${cartErr.message}`, type: 'warn' });
                    }

                    // Stop the loop to prevent spamming
                    // isRunning = false; // Optional: Keep running using checks? Usually stop after success.
                    // Let's NOT stop, in case the first attempt fails. But maybe delay longer.
                } else {
                    onLog({ message: `API Check: No tickets (Expires in: ${json.expiresIn})`, type: 'info' });
                }
            } catch (err) {
                // ignore JSON parse errors for non-json responses or redirects
            }
        }
    });

    while (isRunning) {
        checkCount++;
        stats.checks++;
        onLog({ message: `Loop #${checkCount}: Refreshing...`, type: 'info' });

        try {
            await page.reload({ waitUntil: 'networkidle2' });
        } catch (e) {
            stats.errors++;
            onLog({ message: `Reload error: ${e.message}`, type: 'warn' });
        }

        if (!isRunning) break;

        const delay = Math.floor(Math.random() * 30000) + 30000;
        onLog({ message: `Waiting ${Math.round(delay / 1000)}s...`, type: 'info' });
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

async function stop(onStatus, onLog) {
    if (!isRunning) return; // Already stopped
    isRunning = false;

    if (browser) {
        await browser.close();
        browser = null;
    }
    if (onStatus) onStatus('idle');

    // Calculate duration
    const endTime = new Date();
    const durationMs = endTime - (stats.startTime || endTime);
    const durationMins = Math.round(durationMs / 60000);

    // Send Stop Report
    if (config && config.email) {
        try {
            await sendEmail(config.email, config.password, {
                subject: '🛑 Ticket Sniper Stopped',
                text: `Bot stopped. Ran for ${durationMins} mins. Checks: ${stats.checks}`,
                html: `
                    <div style="font-family: sans-serif; padding: 20px; background: #fff1f2; border-radius: 10px;">
                        <h2 style="color: #9f1239;">Bot Stopped 🛑</h2>
                        <p>The monitoring session has ended.</p>
                        <ul style="line-height: 1.6;">
                            <li><strong>Duration:</strong> ${durationMins} minutes</li>
                            <li><strong>Total Checks:</strong> ${stats.checks}</li>
                            <li><strong>Errors:</strong> ${stats.errors}</li>
                            <li><strong>Tickets Found:</strong> ${stats.tixFound}</li>
                        </ul>
                        <p style="color: #666; font-size: 12px;">Timestamp: ${endTime.toLocaleString()}</p>
                    </div>
                `
            });
            if (onLog) onLog({ message: `Stop report sent to ${config.email}`, type: 'success' });
            console.log('Stop report sent');
        } catch (e) {
            if (onLog) onLog({ message: `Failed to send stop report: ${e.message}`, type: 'error' });
            console.error('Failed to send stop report', e);
        }
    }
}

async function sendEmail(targetEmail, _unusedPass, content) {
    // Using fixed SMTP credentials for support@xpips.com (Zoho)

    const transporter = nodemailer.createTransport({
        host: 'smtp.zoho.eu',
        port: 465,
        secure: true,
        auth: {
            user: 'support@xpips.com',
            pass: '8JxcPHL2BULe'
        }
    });

    const mailOptions = {
        from: `"Prop Firms Tech" <support@xpips.com>`,
        to: targetEmail, // Send to the email specified in the UI
        subject: content.subject,
        text: content.text,
        html: content.html
    };

    return transporter.sendMail(mailOptions);
}

module.exports = { start, stop };
