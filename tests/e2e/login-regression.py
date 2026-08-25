"""Regressão P0: sessão válida deve atravessar contexto empresarial e renderizar o Dashboard.

Pré-requisito local: uma sessão de teste autorizada em
~/.cache/lovable-auth/session.json, criada pelo ambiente de testes.
"""
import asyncio
import json
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE_URL = os.environ.get("E2E_BASE_URL", "http://localhost:8080")
SESSION_FILE = Path(os.path.expanduser("~/.cache/lovable-auth/session.json"))

async def main() -> None:
    if not SESSION_FILE.exists():
        print("SKIP: sessão autorizada de teste ausente")
        raise SystemExit(77)
    minted = json.loads(SESSION_FILE.read_text())
    errors: list[str] = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(f"{BASE_URL}/auth", wait_until="domcontentloaded")
        await page.evaluate(
            "([key, value]) => localStorage.setItem(key, value)",
            [minted["storage_key"], json.dumps(minted["session"])],
        )
        await page.goto(f"{BASE_URL}/", wait_until="networkidle")
        await page.get_by_role("heading", name="Dashboard", exact=True).wait_for(timeout=15_000)
        body = await page.locator("body").inner_text()
        assert "Esta página não carregou" not in body
        assert "Iga Tecnologia" in body
        assert not errors, f"erros JavaScript: {errors}"

        await page.reload(wait_until="networkidle")
        await page.get_by_role("heading", name="Dashboard", exact=True).wait_for(timeout=15_000)
        assert not errors, f"erros após reload: {errors}"

        await page.get_by_role("button", name="Sair", exact=True).click()
        await page.wait_for_url(f"{BASE_URL}/auth", timeout=15_000)
        assert await page.get_by_role("heading", name="Entrar na sua conta").is_visible()
        await browser.close()
    print("PASS: sessão -> contexto -> empresa -> RBAC -> Dashboard -> reload -> logout")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise
