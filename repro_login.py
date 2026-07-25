import asyncio
from playwright.async_api import async_playwright

BASE = "https://revenue-exec.preview.emergentagent.com"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox"])
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page()
        logs = []
        page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
        page.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))

        await page.goto(f"{BASE}/auth?mode=login", wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)
        # accept cookies
        try:
            await page.click("text=Accept", timeout=2500)
        except Exception:
            pass
        # open email form
        await page.click('[data-testid="auth-email-btn"]', timeout=6000)
        await page.wait_for_timeout(600)
        heading = await page.inner_text("h2")
        print("heading:", heading)
        await page.fill('[data-testid="auth-email-input"]', "testpro@test.com")
        await page.fill('[data-testid="auth-password-input"]', "password")
        await page.click('[data-testid="auth-submit-btn"]')
        await page.wait_for_timeout(6000)
        print("URL after submit:", page.url)
        # look for any visible toast/error
        try:
            body = await page.inner_text("body")
            for kw in ["Incorrect", "password", "reach the server", "Too many", "trouble", "failed", "Invalid"]:
                if kw.lower() in body.lower():
                    idx = body.lower().find(kw.lower())
                    print("BODY-HINT:", body[max(0, idx-40):idx+60].replace("\n", " "))
        except Exception as e:
            print("body read err", e)
        cookies = await ctx.cookies()
        print("cookies:", [c["name"] for c in cookies])
        await page.screenshot(path="/app/repro_after_login.png")
        print("---CONSOLE---")
        for l in logs[-25:]:
            print(l)
        await browser.close()


asyncio.run(main())
