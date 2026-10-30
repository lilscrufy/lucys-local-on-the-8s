(function () {
var RetroWeather = window.RetroWeather || (window.RetroWeather = {});

function bindKeyboardControls({
  target,
  stageElement,
  getPages,
  isOverlayOpen,
  onNext,
  onPrevious,
  onTogglePause,
  onToggleHelp,
  onSelectPage,
  onToggleUnits,
  onToggleScanlines,
  onToggleAudio,
  onToggleMotion,
  onDigit,
  onBackspace,
  onMoveFocus,
  onChangeLocation,
  onCloseOverlay,
  onExit
}) {
  target.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const key = String(event.key || '').toLowerCase();
    const keyCode = event.keyCode || event.which;
    const digit = digitFromEvent(event);

    if (isTextEntry(event.target)) {
      if (digit || isBackspaceKey(key, keyCode)) {
        return;
      }
      if (isBackKey(key, keyCode)) {
        event.preventDefault();
        closeOrExit(onCloseOverlay, onExit);
        return;
      }
      if (key === 'arrowup') {
        event.preventDefault();
        onMoveFocus?.(-1);
        return;
      }
      if (key === 'arrowdown') {
        event.preventDefault();
        onMoveFocus?.(1);
        return;
      }
      if (key === 'escape') {
        event.preventDefault();
        onCloseOverlay();
        return;
      }
      if (isOkKey(key, keyCode) && event.target?.id === 'zip-code-entry') {
        event.preventDefault();
        return;
      }
      if (isOkKey(key, keyCode) && activateFocusedControl(event.target)) {
        event.preventDefault();
      }
      return;
    }

    if (isBackKey(key, keyCode)) {
      event.preventDefault();
      closeOrExit(onCloseOverlay, onExit);
      return;
    }

    if (isOkKey(key, keyCode) && activateFocusedControl(event.target)) {
      event.preventDefault();
      return;
    }

    if (digit) {
      if (onDigit?.(digit)) {
        event.preventDefault();
        return;
      }

      const pages = getPages();
      const page = pages[Number(digit) - 1];
      if (page) {
        event.preventDefault();
        onSelectPage(page);
      }
      return;
    }

    switch (remoteKeyName(key, keyCode)) {
      case 'arrowright':
      case 'pagedown':
      case 'channeldown':
      case 'medianexttrack':
      case 'n':
        event.preventDefault();
        if (isArrowKey(key, keyCode, 'right') && adjustRotationControl(event.target, 1)) {
          break;
        }
        if (isOverlayOpen?.() && isArrowKey(key, keyCode, 'right')) {
          onMoveFocus?.(1);
        } else {
          onNext();
        }
        break;
      case 'arrowleft':
      case 'pageup':
      case 'channelup':
      case 'mediaprevioustrack':
      case 'p':
        event.preventDefault();
        if (isArrowKey(key, keyCode, 'left') && adjustRotationControl(event.target, -1)) {
          break;
        }
        if (isOverlayOpen?.() && isArrowKey(key, keyCode, 'left')) {
          onMoveFocus?.(-1);
        } else {
          onPrevious();
        }
        break;
      case 'arrowup':
        event.preventDefault();
        onMoveFocus?.(-1);
        break;
      case 'arrowdown':
        event.preventDefault();
        onMoveFocus?.(1);
        break;
      case ' ':
      case 'enter':
        event.preventDefault();
        onTogglePause();
        break;
      case 'escape':
        event.preventDefault();
        closeOrExit(onCloseOverlay, onExit);
        break;
      case 'backspace':
      case 'delete':
        if (onBackspace?.()) {
          event.preventDefault();
        }
        break;
      case '?':
      case '/':
      case 'h':
        event.preventDefault();
        onToggleHelp();
        break;
      case 'u':
        event.preventDefault();
        onToggleUnits();
        break;
      case 's':
        event.preventDefault();
        onToggleScanlines();
        break;
      case 'm':
        event.preventDefault();
        onToggleAudio();
        break;
      case 'd':
        break;
      case 'r':
        event.preventDefault();
        onToggleMotion();
        break;
      case 'l':
        event.preventDefault();
        onChangeLocation();
        break;
      case 'home':
        event.preventDefault();
        onSelectPage(getPages()[0]);
        break;
      case 'red':
        event.preventDefault();
        onToggleHelp();
        break;
      case 'green':
        event.preventDefault();
        onToggleAudio();
        break;
      case 'yellow':
        event.preventDefault();
        onChangeLocation();
        break;
      case 'blue':
        event.preventDefault();
        onToggleMotion();
        break;
      case 'f':
        event.preventDefault();
        requestFullscreen(stageElement);
        break;
      default:
        break;
    }

  });
}

function isTextEntry(target) {
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable;
}

function isOkKey(key, keyCode) {
  return key === 'enter' || key === ' ' || keyCode === 13 || keyCode === 32;
}

function isArrowKey(key, keyCode, direction) {
  if (direction === 'left') {
    return key === 'arrowleft' || keyCode === 37;
  }

  return key === 'arrowright' || keyCode === 39;
}

function adjustRotationControl(target, direction) {
  const control = target?.closest?.('.wx-rotation-control');
  if (!control) {
    return false;
  }

  const step = control.querySelector(`[data-rotation-step="${direction}"]`);
  if (step && !step.disabled) {
    step.click();
  }

  return true;
}

function activateFocusedControl(target) {
  if (target?.tagName === 'BUTTON') {
    target.click();
    return true;
  }

  if (target?.tagName === 'INPUT' && target.form) {
    if (typeof target.form.requestSubmit === 'function') {
      target.form.requestSubmit();
    } else {
      target.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
    return true;
  }

  return false;
}

function digitFromEvent(event) {
  const key = event.key;
  if (/^\d$/.test(key)) {
    return key;
  }

  const code = event.keyCode || event.which;
  if (code >= 48 && code <= 57) {
    return String(code - 48);
  }
  if (code >= 96 && code <= 105) {
    return String(code - 96);
  }

  return '';
}

function isBackspaceKey(key, keyCode) {
  return key === 'backspace' || key === 'delete' || keyCode === 8 || keyCode === 46;
}

function isBackKey(key, keyCode) {
  return key === 'browserback' || key === 'goback' || keyCode === 461;
}

function remoteKeyName(key, keyCode) {
  const keyCodeMap = new Map([
    [13, 'enter'],
    [19, ' '],
    [32, ' '],
    [33, 'pageup'],
    [34, 'pagedown'],
    [36, 'home'],
    [37, 'arrowleft'],
    [38, 'arrowup'],
    [39, 'arrowright'],
    [40, 'arrowdown'],
    [403, 'red'],
    [404, 'green'],
    [405, 'yellow'],
    [406, 'blue'],
    [412, 'pageup'],
    [415, ' '],
    [417, 'pagedown'],
    [427, 'channelup'],
    [428, 'channeldown']
  ]);

  return keyCodeMap.get(keyCode) || key;
}

function closeOrExit(onCloseOverlay, onExit) {
  if (onCloseOverlay()) {
    return true;
  }

  return Boolean(onExit?.());
}

function requestFullscreen(element) {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
    return;
  }

  element.requestFullscreen?.();
}

RetroWeather.bindKeyboardControls = bindKeyboardControls;
}());
