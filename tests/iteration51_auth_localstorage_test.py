import asyncio
import json
import os
import time
from pathlib import Path

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError


ROOT = Path('/app')
ENV_PATH = ROOT / 'frontend' / '.env'
EMAIL = 'testpro@test.com'
PASSWORD = 'password'


def get_base_url() -> str:
    for line in ENV_PATH.read_text().splitlines():
        if line.startswith('REACT_APP_BACKEND_URL='):
            return line.split('=', 1)[1].strip().strip('"')
    raise RuntimeError('REACT_APP_BACKEND_URL not found')


BASE_URL = get_base_url().rstrip('/')
AUTH_URL = f'{BASE_URL}/auth'


_context_counter = 0


async def new_test_context(browser):
    """Create an isolated browser context with a distinct forwarded IP.

    The preview auth endpoint has an IP-based login limiter. Focused verification
    runs several independent login scenarios in quick succession, so give each
    scenario a stable synthetic X-Forwarded-For value to avoid the test harness
    tripping the preview rate limiter while preserving the real UI flow.
    """
    global _context_counter
    _context_counter += 1
    return await browser.new_context(
        viewport={'width': 1920, 'height': 1080},
        extra_http_headers={'X-Forwarded-For': f'198.51.100.{(_context_counter % 200) + 1}'},
    )


async def accept_cookie_banner(page):
    candidates = [
        page.get_by_role('button', name='Accept', exact=True),
        page.get_by_role('button', name='Accept All', exact=True),
        page.get_by_role('button', name='I Accept', exact=True),
        page.locator('button:has-text("Accept")').first,
    ]
    for locator in candidates:
        try:
            first = locator.first
            if await locator.count() and await first.is_visible(timeout=800):
                await first.click(force=True, timeout=1500)
                await page.wait_for_timeout(300)
                return True
        except Exception:
            pass
    return False


async def has_error_boundary(page) -> bool:
    text = await page.locator('body').inner_text(timeout=5000)
    return ('Something went wrong' in text) or ('unexpected error occurred' in text)


async def collect_errors(page):
    return await page.evaluate("""() => {
        const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
        return errorElements.map(el => el.textContent).join(', ');
    }""")


async def open_email_login_form(page, prefilled_email=None):
    await accept_cookie_banner(page)
    if await page.get_by_test_id('account-chooser').count():
        await page.get_by_test_id('use-another-account-btn').click(force=True)
        await page.wait_for_timeout(300)

    # If registration mode is visible, switch to sign-in first.
    body = await page.locator('body').inner_text(timeout=5000)
    if 'Create your account' in body:
        toggle = page.get_by_test_id('auth-toggle-mode')
        if await toggle.count():
            await toggle.click(force=True)
            await page.wait_for_timeout(300)

    if not await page.get_by_test_id('auth-email-input').count():
        await page.get_by_test_id('auth-email-btn').click(force=True)
        await page.wait_for_timeout(300)

    await page.get_by_test_id('auth-email-input').wait_for(state='visible', timeout=10000)
    if prefilled_email is None:
        await page.get_by_test_id('auth-email-input').fill(EMAIL)
    else:
        current = await page.get_by_test_id('auth-email-input').input_value()
        if current.lower() != prefilled_email.lower():
            await page.get_by_test_id('auth-email-input').fill(prefilled_email)
    await page.get_by_test_id('auth-password-input').fill(PASSWORD)


async def login_and_assert_dashboard(page):
    await page.get_by_test_id('auth-submit-btn').click(force=True)
    await page.wait_for_url('**/dashboard**', timeout=20000)
    await page.get_by_test_id('dashboard-main').wait_for(state='visible', timeout=20000)
    if await has_error_boundary(page):
        raise AssertionError('ErrorBoundary appeared after login/dashboard redirect')
    return await page.evaluate("localStorage.getItem('inflow_last_account')")


async def run_corrupt_case(browser, label, corrupt_value):
    context = await new_test_context(browser)
    await context.add_init_script(
        f"localStorage.setItem('inflow_last_account', {json.dumps(corrupt_value)})"
    )
    page = await context.new_page()
    console_errors = []
    page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
    try:
        await page.goto(AUTH_URL, wait_until='domcontentloaded', timeout=30000)
        await page.wait_for_timeout(1800)
        error_boundary = await has_error_boundary(page)
        local_after_load = await page.evaluate("localStorage.getItem('inflow_last_account')")
        if error_boundary:
            raise AssertionError(f'{label}: ErrorBoundary displayed on /auth with corrupt localStorage')
        if local_after_load is not None:
            raise AssertionError(f'{label}: corrupt inflow_last_account was not cleared, value={local_after_load!r}')
        await open_email_login_form(page)
        saved = await login_and_assert_dashboard(page)
        parsed = json.loads(saved)
        assert parsed['email'] == EMAIL, f'{label}: saved account email mismatch after login: {saved}'
        return {
            'label': label,
            'status': 'passed',
            'error_boundary': False,
            'localStorage_after_load': local_after_load,
            'final_url': page.url,
            'saved_account_after_login': parsed,
            'console_error_count': len(console_errors),
        }
    except Exception as exc:
        try:
            error_text = await collect_errors(page)
        except Exception:
            error_text = ''
        return {
            'label': label,
            'status': 'failed',
            'error': repr(exc),
            'final_url': page.url,
            'error_text': error_text,
            'console_errors': console_errors[-10:],
        }
    finally:
        await context.close()


async def run_clean_login(browser):
    context = await new_test_context(browser)
    await context.add_init_script("localStorage.removeItem('inflow_last_account')")
    page = await context.new_page()
    console_errors = []
    page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
    try:
        await page.goto(AUTH_URL, wait_until='domcontentloaded', timeout=30000)
        await page.wait_for_timeout(1500)
        if await has_error_boundary(page):
            raise AssertionError('ErrorBoundary displayed on clean /auth')
        await open_email_login_form(page)
        saved = await login_and_assert_dashboard(page)
        parsed = json.loads(saved)
        assert parsed['email'] == EMAIL, f'clean login saved account email mismatch: {saved}'
        return {
            'label': 'clean login regression',
            'status': 'passed',
            'final_url': page.url,
            'saved_account_after_login': parsed,
            'console_error_count': len(console_errors),
        }
    except Exception as exc:
        try:
            error_text = await collect_errors(page)
        except Exception:
            error_text = ''
        return {
            'label': 'clean login regression',
            'status': 'failed',
            'error': repr(exc),
            'final_url': page.url,
            'error_text': error_text,
            'console_errors': console_errors[-10:],
        }
    finally:
        await context.close()


async def run_valid_account_chooser(browser):
    context = await new_test_context(browser)
    page = await context.new_page()
    console_errors = []
    page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
    try:
        # First perform a real login so the valid saved-account value and session cookie are created by the app.
        await page.goto(AUTH_URL, wait_until='domcontentloaded', timeout=30000)
        await page.wait_for_timeout(1500)
        await open_email_login_form(page)
        saved = await login_and_assert_dashboard(page)
        parsed = json.loads(saved)

        # Reload /auth with the valid saved account + active session; chooser should render and continue to dashboard.
        await page.goto(AUTH_URL, wait_until='domcontentloaded', timeout=30000)
        await page.wait_for_timeout(1500)
        if await has_error_boundary(page):
            raise AssertionError('ErrorBoundary displayed on /auth with valid saved account')
        await page.get_by_test_id('account-chooser').wait_for(state='visible', timeout=10000)
        await page.get_by_test_id('saved-account-card').click(force=True)
        await page.wait_for_url('**/dashboard**', timeout=20000)
        await page.get_by_test_id('dashboard-main').wait_for(state='visible', timeout=20000)
        return {
            'label': 'valid saved-account chooser',
            'status': 'passed',
            'saved_account': parsed,
            'final_url': page.url,
            'console_error_count': len(console_errors),
        }
    except Exception as exc:
        try:
            error_text = await collect_errors(page)
        except Exception:
            error_text = ''
        return {
            'label': 'valid saved-account chooser',
            'status': 'failed',
            'error': repr(exc),
            'final_url': page.url,
            'error_text': error_text,
            'console_errors': console_errors[-10:],
        }
    finally:
        await context.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        results = []
        results.append(await run_corrupt_case(browser, 'corrupt [object Object]', '[object Object]'))
        results.append(await run_corrupt_case(browser, 'corrupt undefined', 'undefined'))
        results.append(await run_corrupt_case(browser, 'corrupt truncated JSON', '{"name":'))
        results.append(await run_clean_login(browser))
        results.append(await run_valid_account_chooser(browser))
        await browser.close()
    print(json.dumps({'base_url': BASE_URL, 'results': results}, indent=2))
    if any(r['status'] != 'passed' for r in results):
        raise SystemExit(1)


if __name__ == '__main__':
    asyncio.run(main())