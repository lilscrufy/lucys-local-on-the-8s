from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "screenshots"


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        context.add_init_script(
            "localStorage.setItem('retro-weather-settings', "
            "JSON.stringify({weatherMode:'mock',audioEnabled:false,scanlines:true}));"
        )
        page = context.new_page()
        page_errors = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.goto("http://localhost:4173", wait_until="networkidle")
        page.locator(".retro-stage").wait_for()
        assert page.locator(".weather-title").inner_text() == "3 Day Outlook"
        page.wait_for_timeout(350)
        page.screenshot(path=str(OUTPUT / "three-day-outlook.png"), animations="disabled")

        pages = [
            ("1", "Current Conditions", "current-conditions.png"),
            ("2", "Local Forecast", "local-forecast.png"),
            ("4", "Regional Conditions", "regional-conditions.png"),
            ("6", "Almanac", "almanac.png"),
            ("7", "Air Quality", "air-quality.png"),
            ("8", "Moon Phase", "moon-phase.png"),
            ("9", "Settings", "settings.png"),
        ]
        for key, title, filename in pages:
            page.keyboard.press(key)
            page.wait_for_timeout(100)
            assert page.locator(".weather-title").inner_text() == title
            page.screenshot(path=str(OUTPUT / filename), animations="disabled")

        page.keyboard.press("3")
        page.keyboard.press("s")
        assert page.locator(".retro-stage").get_attribute("data-scanlines") == "false"
        page.screenshot(path=str(OUTPUT / "filter-off.png"), animations="disabled")
        page.keyboard.press("s")
        assert page.locator(".retro-stage").get_attribute("data-scanlines") == "true"
        page.keyboard.press("h")
        assert page.locator(".retro-stage__help:not(.retro-stage__setup)").is_visible()
        page.screenshot(path=str(OUTPUT / "controls.png"), animations="disabled")
        assert not page_errors, page_errors
        browser.close()


if __name__ == "__main__":
    main()
