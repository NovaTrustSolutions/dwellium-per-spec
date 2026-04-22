const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  await page.goto('http://localhost:5173/');
  console.log("Navigated");
  
  await page.waitForSelector('input[type="password"]', {timeout: 5000});
  await page.fill('input[type="password"]', 'Walkthrough documenting production');
  await page.keyboard.press('Enter');
  
  console.log("Logged in");
  await page.waitForTimeout(3000);
  
  await browser.close();
})();
