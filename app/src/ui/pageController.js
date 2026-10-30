(function () {
var RetroWeather = window.RetroWeather || (window.RetroWeather = {});

class PageController {
  constructor({ pages, initialPage, rotationSeconds, canRotate = () => true }) {
    this.pages = [...pages];
    this.pageIndex = Math.max(0, this.pages.indexOf(initialPage));
    this.rotationSeconds = rotationSeconds;
    this.canRotate = canRotate;
    this.paused = false;
    this.timerId = null;
    this.listeners = new Set();
  }

  get currentPage() {
    return this.pages[this.pageIndex] || this.pages[0];
  }

  get pageCount() {
    return this.pages.length;
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start() {
    this.stop();
    this.timerId = window.setInterval(() => {
      if (!this.paused && this.canRotate()) {
        this.next();
      }
    }, this.rotationSeconds * 1000);
  }

  stop() {
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  setRotationSeconds(seconds) {
    this.rotationSeconds = seconds;
    this.start();
  }

  setPages(pages) {
    const current = this.currentPage;
    this.pages = [...pages];
    this.pageIndex = Math.max(0, this.pages.indexOf(current));
    this.emit();
    this.start();
  }

  goTo(pageId) {
    const nextIndex = this.pages.indexOf(pageId);
    if (nextIndex === -1) {
      return;
    }

    this.pageIndex = nextIndex;
    this.emit();
    this.start();
  }

  next(options = {}) {
    this.pageIndex = (this.pageIndex + 1) % this.pages.length;
    this.emit();
    if (options.restartTimer) {
      this.start();
    }
  }

  previous(options = {}) {
    this.pageIndex = (this.pageIndex - 1 + this.pages.length) % this.pages.length;
    this.emit();
    if (options.restartTimer) {
      this.start();
    }
  }

  togglePaused() {
    this.paused = !this.paused;
    this.emit();
  }

  emit() {
    const snapshot = {
      page: this.currentPage,
      pageIndex: this.pageIndex,
      pageCount: this.pageCount,
      paused: this.paused
    };

    this.listeners.forEach((listener) => listener(snapshot));
  }
}

RetroWeather.PageController = PageController;
}());
