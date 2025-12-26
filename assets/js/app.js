/*!
* 毛泽东生平地理轨迹可视化 - 主脚本文件
* Author: sansan0
* GitHub: https://github.com/sansan0/mao-map
*/

// ==================== i18n 国际化 ====================
/**
* 初始化多语言支持
*/
async function initI18n() {
  try {
    // 获取首选语言
    const preferredLocale = i18n.getPreferredLocale();
    console.log('检测到首选语言:', preferredLocale);

    // 加载首选语言包
    await i18n.loadLocale(preferredLocale);
    await i18n.setLocale(preferredLocale);

    // 初始化语言切换按钮
    initLanguageSelector();

    console.log('i18n 初始化完成, 当前语言:', i18n.getCurrentLocale());
  } catch (error) {
    console.error('i18n 初始化失败:', error);
  }
}

/**
* 初始化语言选择器
*/
function initLanguageSelector() {
  const langButtons = document.querySelectorAll('.lang-btn');

  langButtons.forEach(btn => {
    const lang = btn.getAttribute('data-lang');

    // 设置初始激活状态
    if (lang === i18n.getCurrentLocale()) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }

    // 绑定点击事件
    btn.addEventListener('click', async () => {
      const selectedLang = btn.getAttribute('data-lang');

      // 更新按钮状态
      langButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 保存当前事件索引，用于语言切换后恢复位置
      const savedEventIndex = currentEventIndex;

      // 切换语言
      await i18n.setLocale(selectedLang);

      console.log('语言已切换至:', selectedLang);

      // 重新加载事件数据
      try {
        trajectoryData = await loadTrajectoryData();

        // 更新时间轴滑块的最大值
        const slider = document.getElementById('timeline-slider');
        if (slider && trajectoryData && trajectoryData.events) {
          slider.max = trajectoryData.events.length - 1;
        }

        // 更新总事件数显示
        const totalCountEls = document.querySelectorAll('[id^="total-event-count"]');
        totalCountEls.forEach((el) => {
          if (el && trajectoryData) el.textContent = trajectoryData.events.length;
        });

        // 清除所有现有的标记和路径
        eventMarkers.forEach((marker) => map.removeLayer(marker));
        eventMarkers = [];
        locationMarkers.clear();
        pathLayers.forEach((path) => {
          if (path._map) map.removeLayer(path);
        });
        pathLayers = [];
        motionPaths.clear();

        // 恢复到之前保存的事件索引位置
        // 确保索引在有效范围内
        const restoredIndex = Math.min(savedEventIndex, trajectoryData.events.length - 1);
        currentEventIndex = restoredIndex;
        previousEventIndex = Math.max(0, restoredIndex - 1);
        showEventAtIndex(restoredIndex, false);

        // 更新统计信息
        updateStatistics();

        console.log('语言切换完成，恢复到事件索引:', restoredIndex);
      } catch (error) {
        console.error('重新加载事件数据失败:', error);
      }

      // 更新速度下拉选择框
      if (window.updateSpeedSelect) {
        window.updateSpeedSelect();
      }
    });
  });
}

// ==================== 全局变量 ====================
let map = null;
let regionsData = null;
let trajectoryData = null;
let currentEventIndex = 0;
let previousEventIndex = 0;
let isPlaying = false;
let playInterval = null;
let eventMarkers = [];
let pathLayers = [];
let coordinateMap = new Map();
let locationGroups = new Map();
let locationMarkers = new Map();
let statsHoverTimeout = null;
let currentPlaySpeed = 1000;
let isPanelVisible = true;
let isFeedbackModalVisible = false;
let isCameraFollowEnabled = true;
let isDragging = false;

let isPoetryAnimationPlaying = false;
let poetryAnimationTimeout = null;

let isMusicModalVisible = false;
let currentMusicIndex = 0;
let isMusicPlaying = false;
let musicAudio = null;
let musicProgressInterval = null;
let musicVolume = 0.5;

// 添加音频状态管理变量
let audioLoadingPromise = null;
let isAutoPlayPending = false;
let currentAudioEventListeners = new Set();

let highlightedPaths = [];
let highlightTimeout = null;
let currentHighlightedEventIndex = -1;

let animationConfig = {
  pathDuration: 5000, // 控制路径绘制速度
  timelineDuration: 1500, // 时间轴动画时长
  cameraFollowDuration: 2000, // 镜头跟随动画时长
  cameraPanDuration: 1500, //镜头平移动画时长
  isAnimating: false,
  motionOptions: {
    auto: false, // 手动控制动画
    easing: L.Motion.Ease.easeInOutQuart,
  },
};

// 镜头速度档位配置
const CAMERA_SPEED_LEVELS = [
  {
    name: "ui.animation.speedLevels.fastest",
    cameraFollowDuration: 600,
    cameraPanDuration: 400,
  },
  {
    name: "ui.animation.speedLevels.fast",
    cameraFollowDuration: 2000,
    cameraPanDuration: 1500,
  },
  {
    name: "ui.animation.speedLevels.slow",
    cameraFollowDuration: 3500,
    cameraPanDuration: 2800,
  },
  {
    name: "ui.animation.speedLevels.slowest",
    cameraFollowDuration: 5000,
    cameraPanDuration: 4000,
  },
];

let motionPaths = new Map();
let animationQueue = [];
let isAnimationInProgress = false;

// ==================== 全局常量 ====================
const INTERNATIONAL_COORDINATES = {
  "俄罗斯 莫斯科": [37.6176, 55.7558],
};

/**
* 检测是否为移动设备
*/
function isMobileDevice() {
  return window.innerWidth <= 768;
}

// ==================== 移动端交互 ====================
/**
* 切换控制面板显示/隐藏状态
*/
function toggleControlPanel() {
  const panel = document.getElementById("timeline-control");
  const toggleBtn = document.getElementById("toggle-panel-btn");
  const mapEl = document.getElementById("map");

  if (isPanelVisible) {
    panel.classList.add("hidden");
    toggleBtn.textContent = "⬆";
    mapEl.classList.remove("panel-visible");
    mapEl.classList.add("panel-hidden");
    isPanelVisible = false;
  } else {
    panel.classList.remove("hidden");
    toggleBtn.textContent = "⚙";
    mapEl.classList.remove("panel-hidden");
    mapEl.classList.add("panel-visible");
    isPanelVisible = true;
  }

  setTimeout(() => {
    if (map && map.invalidateSize) {
      map.invalidateSize({
        animate: true,
        pan: false,
      });
    }
  }, 350);
}

/**
* 获取控制面板高度
*/
function getControlPanelHeight() {
  const panel = document.getElementById("timeline-control");
  if (!panel || panel.classList.contains("hidden")) {
    return 0;
  }

  const rect = panel.getBoundingClientRect();
  return rect.height;
}

/**
* 初始化移动端交互功能
*/
function initMobileInteractions() {
  const toggleBtn = document.getElementById("toggle-panel-btn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", toggleControlPanel);
  }

  if (map && isMobileDevice()) {
    map.on("dblclick", (e) => {
      e.originalEvent.preventDefault();
      toggleControlPanel();
    });
  }
}

/**
* 初始化Leaflet地图
*/
function initMap() {
  map = L.map("map", {
    center: [35.8617, 104.1954],
    zoom: 5,
    minZoom: 4,
    maxZoom: 10,
    zoomControl: true,
    attributionControl: false,
    tap: true,
    tapTolerance: 15,
  });

  L.tileLayer(
    "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
    {
      subdomains: "1234",
      attribution: "© 高德地图",
      maxZoom: 18,
    }
  ).addTo(map);

  console.log("地图初始化完成");
}

// ==================== 统计面板控制 ====================
/**
* 初始化PC端统计面板悬停交互
*/
function initStatsHover() {
  const statsPanel = document.getElementById("stats-panel");
  const hoverArea = document.getElementById("stats-hover-area");

  if (!statsPanel || !hoverArea || isMobileDevice()) return;

  function showStatsPanel() {
    if (statsHoverTimeout) {
      clearTimeout(statsHoverTimeout);
      statsHoverTimeout = null;
    }
    statsPanel.classList.add("visible");
  }

  function hideStatsPanel() {
    statsHoverTimeout = setTimeout(() => {
      statsPanel.classList.remove("visible");
    }, 150);
  }

  hoverArea.addEventListener("mouseenter", showStatsPanel);
  hoverArea.addEventListener("mouseleave", hideStatsPanel);
  statsPanel.addEventListener("mouseenter", showStatsPanel);
  statsPanel.addEventListener("mouseleave", hideStatsPanel);
}

// ==================== 详细信息弹窗控制 ====================
/**
* 初始化详细信息弹窗交互
*/
function initDetailModal() {
  const modal = document.getElementById("location-detail-modal");
  const backdrop = document.getElementById("detail-modal-backdrop");
  const closeBtn = document.getElementById("detail-modal-close");

  if (closeBtn) {
    closeBtn.addEventListener("click", hideDetailModal);
  }

  if (backdrop) {
    backdrop.addEventListener("click", hideDetailModal);
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modal = document.getElementById("location-detail-modal");
      if (modal && modal.classList.contains("visible")) {
        hideDetailModal();
      }
    }
  });
}

/**
* 显示地点详细信息弹窗
*/
function showDetailModal(locationGroup) {
  const modal = document.getElementById("location-detail-modal");
  const backdrop = document.getElementById("detail-modal-backdrop");
  const titleEl = document.getElementById("modal-location-title");
  const summaryEl = document.getElementById("modal-visit-summary");
  const contentEl = document.getElementById("modal-content");

  if (!modal || !titleEl || !summaryEl || !contentEl) return;

  const { location, events } = locationGroup;
  const visitCount = events.length;

  // 使用当前语言的访问类型标签进行过滤
  const transitLabel = i18n.t('ui.visitType.transit');
  const destinationLabel = i18n.t('ui.visitType.destination');
  const startLabel = i18n.t('ui.visitType.start');
  const activityLabel = i18n.t('ui.visitType.activity');
  const birthLabel = i18n.t('ui.visitType.birth');

  const transitCount = events.filter((e) => e.visitType === transitLabel).length;
  const destCount = events.filter((e) => e.visitType === destinationLabel).length;
  const startCount = events.filter((e) => e.visitType === startLabel).length;
  const activityCount = events.filter((e) => e.visitType === activityLabel).length;
  const birthCount = events.filter((e) => e.visitType === birthLabel).length;

  titleEl.textContent = `📍 ${location}`;

  // 使用国际化的摘要文本
  const summaryText = i18n.t('ui.panel.visitSummary', { count: visitCount });

  let descParts = [];
  if (birthCount > 0) descParts.push(`${birthCount}${i18n.t('ui.panel.visitTypes.birth')}`);
  if (destCount > 0) descParts.push(`${destCount}${i18n.t('ui.panel.visitTypes.arrive')}`);
  if (startCount > 0) descParts.push(`${startCount}${i18n.t('ui.panel.visitTypes.depart')}`);
  if (transitCount > 0) descParts.push(`${transitCount}${i18n.t('ui.panel.visitTypes.transit')}`);
  if (activityCount > 0) descParts.push(`${activityCount}${i18n.t('ui.panel.visitTypes.activity')}`);

  if (descParts.length > 0) {
    summaryEl.innerHTML = summaryText + ` (${descParts.join('，')})`;
  } else {
    summaryEl.innerHTML = summaryText;
  }

  const sortedEvents = [...events].sort((a, b) => a.index - b.index);

  const eventListHtml = sortedEvents
    .map((event, index) => {
      const isCurrentEvent = event.index === currentEventIndex;
      const itemClass = isCurrentEvent
        ? "event-item current-event"
        : "event-item";

      let visitTypeClass = "";
      let visitTypeLabel = "";
      let visitOrderClass = "";

      // 使用国际化的顺序编号
      const orderNumber = i18n.t('ui.panel.orderNumber', { n: index + 1 });

      // 根据访问类型获取对应的国际化标签
      const birthLabel = i18n.t('ui.visitType.birth');
      const startLabel = i18n.t('ui.visitType.start');
      const destinationLabel = i18n.t('ui.visitType.destination');
      const transitLabel = i18n.t('ui.visitType.transit');
      const activityLabel = i18n.t('ui.visitType.activity');

      if (event.visitType === birthLabel) {
        visitTypeClass = "birth-event";
        visitTypeLabel = birthLabel;
        visitOrderClass = "birth-order";
      } else if (event.visitType === startLabel) {
        visitTypeClass = "start-event";
        visitTypeLabel = startLabel;
        visitOrderClass = "start-order";
      } else if (event.visitType === destinationLabel) {
        visitTypeLabel = destinationLabel;
        visitOrderClass = "";
      } else if (event.visitType === transitLabel) {
        visitTypeClass = "transit-event";
        visitTypeLabel = transitLabel;
        visitOrderClass = "transit-order";
      } else if (event.visitType === activityLabel) {
        visitTypeClass = "activity-event";
        visitTypeLabel = activityLabel;
        visitOrderClass = "activity-order";
      }

      // 处理事件描述，如果是途径类型，添加国际化的前缀
      let eventDescription = event.originalEvent || event.event;
      if (event.visitType === transitLabel && event.originalEvent) {
        const transitPrefix = i18n.t('ui.panel.transitPrefix');
        eventDescription = transitPrefix + event.originalEvent;
      }

      // 使用国际化的年龄显示
      const ageDisplay = event.age
        ? `<div class="event-age">${i18n.t('ui.panel.eventAge', { age: event.age })}</div>`
        : "";

      return `
      <div class="${itemClass} ${visitTypeClass}" data-event-index="${
        event.index
      }">
        <div class="event-header">
          <span class="visit-order-number">${orderNumber}</span>
          <span class="event-date-item">${event.date}</span>
          <span class="visit-order ${visitOrderClass}">${visitTypeLabel}</span>
        </div>
        <div class="event-description">${eventDescription}</div>
        ${ageDisplay}
      </div>
    `;
    })
    .join("");

  contentEl.innerHTML = eventListHtml;

  const eventItems = contentEl.querySelectorAll(".event-item");
  eventItems.forEach((item) => {
    const eventIndex = parseInt(item.dataset.eventIndex);

    item.addEventListener("click", (e) => {
      e.stopPropagation();

      if (currentHighlightedEventIndex === eventIndex) {
        clearPathHighlight();
        return;
      }

      if (currentHighlightedEventIndex !== -1) {
        quickClearPathHighlight();
      }

      highlightEventPath(eventIndex);

      item.classList.add("event-item-clicked");
      setTimeout(() => {
        item.classList.remove("event-item-clicked");
      }, 300);
    });

    item.addEventListener("mouseenter", (e) => {
      if (currentHighlightedEventIndex !== eventIndex) {
        item.style.cursor = "pointer";
        item.style.transform = "translateX(2px)";
      }
    });

    item.addEventListener("mouseleave", (e) => {
      item.style.transform = "";
    });
  });

  if (backdrop) {
    backdrop.classList.add("visible");
  }

  modal.classList.add("visible");
  document.body.style.overflow = "hidden";
}

/**
* 隐藏详细信息弹窗
*/
function hideDetailModal() {
  const modal = document.getElementById("location-detail-modal");
  const backdrop = document.getElementById("detail-modal-backdrop");

  if (modal) {
    modal.classList.remove("visible");
  }

  if (backdrop) {
    backdrop.classList.remove("visible");
  }

  document.body.style.overflow = "";
}

// ==================== 反馈功能控制 ====================
/**
* 初始化反馈功能
*/
function initFeedbackModal() {
  const feedbackBtn = document.getElementById("feedback-btn");
  const feedbackModal = document.getElementById("feedback-modal");
  const feedbackBackdrop = document.getElementById("feedback-backdrop");
  const feedbackClose = document.getElementById("feedback-modal-close");

  if (feedbackBtn) {
    feedbackBtn.addEventListener("click", showFeedbackModal);
  }

  if (feedbackClose) {
    feedbackClose.addEventListener("click", hideFeedbackModal);
  }

  if (feedbackBackdrop) {
    feedbackBackdrop.addEventListener("click", hideFeedbackModal);
  }

  if (feedbackModal) {
    feedbackModal.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  const issuesItem = document.getElementById("feedback-issues");
  const projectItem = document.getElementById("feedback-project");
  const wechatItem = document.getElementById("feedback-wechat");

  if (issuesItem) {
    issuesItem.addEventListener("click", () => {
      openGitHubIssues();
      hideFeedbackModal();
    });
  }

  if (projectItem) {
    projectItem.addEventListener("click", () => {
      openGitHubProject();
      hideFeedbackModal();
    });
  }

  if (wechatItem) {
    wechatItem.addEventListener("click", () => {
      handleWeChatAction();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isFeedbackModalVisible) {
      hideFeedbackModal();
    }
  });

  initWeChatQRModal();
}

/**
* 显示反馈弹窗
*/
function showFeedbackModal() {
  const feedbackModal = document.getElementById("feedback-modal");
  const feedbackBackdrop = document.getElementById("feedback-backdrop");

  if (feedbackModal && feedbackBackdrop) {
    feedbackBackdrop.classList.add("visible");
    feedbackModal.classList.add("visible");
    isFeedbackModalVisible = true;

    document.body.style.overflow = "hidden";
  }
}

/**
* 隐藏反馈弹窗
*/
function hideFeedbackModal() {
  const feedbackModal = document.getElementById("feedback-modal");
  const feedbackBackdrop = document.getElementById("feedback-backdrop");

  if (feedbackModal && feedbackBackdrop) {
    feedbackBackdrop.classList.remove("visible");
    feedbackModal.classList.remove("visible");
    isFeedbackModalVisible = false;

    document.body.style.overflow = "";
  }
}

/**
* 打开GitHub Issues页面
*/
function openGitHubIssues() {
  const issuesUrl = "https://github.com/sansan0/mao-map/issues";
  window.open(issuesUrl, "_blank", "noopener,noreferrer");
}

/**
* 打开GitHub项目主页
*/
function openGitHubProject() {
  const projectUrl = "https://github.com/sansan0/mao-map";
  window.open(projectUrl, "_blank", "noopener,noreferrer");
}

/**
* 检测是否为移动设备
*/
function isMobileDevice() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i;
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth <= 768;

  return mobileRegex.test(userAgent) || (hasTouchScreen && isSmallScreen);
}

/**
* 处理微信公众号操作（移动端复制，PC端显示二维码）
*/
function handleWeChatAction() {
  hideFeedbackModal();

  if (isMobileDevice()) {
    copyWeChatName();
  } else {
    showWeChatQRModal();
  }
}

/**
* 复制微信公众号名称
*/
function copyWeChatName() {
  const wechatName = i18n.t('messages.wechatName');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(wechatName)
      .then(() => {
        showTemporaryMessage(
          i18n.t('messages.wechatCopied', { name: wechatName }),
          "success"
        );
      })
      .catch(() => {
        showTemporaryMessage(i18n.t('messages.wechatSearch', { name: wechatName }), "info");
      });
  } else {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = wechatName;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      textArea.setSelectionRange(0, 99999);
      document.execCommand("copy");
      document.body.removeChild(textArea);
      showTemporaryMessage(
        i18n.t('messages.wechatCopied', { name: wechatName }),
        "success"
      );
    } catch (err) {
      showTemporaryMessage(i18n.t('messages.wechatSearch', { name: wechatName }), "info");
    }
  }
}

/**
* 显示微信二维码弹窗
*/
function showWeChatQRModal() {
  const modal = document.getElementById("wechat-qr-modal");
  const backdrop = document.getElementById("wechat-qr-backdrop");

  if (modal && backdrop) {
    backdrop.classList.add("visible");
    modal.classList.add("visible");
    document.body.style.overflow = "hidden";
  }
}

/**
* 隐藏微信二维码弹窗
*/
function hideWeChatQRModal() {
  const modal = document.getElementById("wechat-qr-modal");
  const backdrop = document.getElementById("wechat-qr-backdrop");

  if (modal && backdrop) {
    backdrop.classList.remove("visible");
    modal.classList.remove("visible");
    document.body.style.overflow = "";
  }
}

/**
* 初始化微信二维码弹窗
*/
function initWeChatQRModal() {
  const backdrop = document.getElementById("wechat-qr-backdrop");
  const closeBtn = document.getElementById("wechat-qr-close");
  const modal = document.getElementById("wechat-qr-modal");

  if (backdrop) {
    backdrop.addEventListener("click", hideWeChatQRModal);
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", hideWeChatQRModal);
  }

  if (modal) {
    modal.addEventListener("click", (e) => e.stopPropagation());
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modal = document.getElementById("wechat-qr-modal");
      if (modal && modal.classList.contains("visible")) {
        hideWeChatQRModal();
      }
    }
  });
}

/**
* 显示临时提示消息
*/
function showTemporaryMessage(message, type = "info") {
  const existingMessage = document.querySelector(".temp-message");
  if (existingMessage) {
    existingMessage.remove();
  }

  const messageDiv = document.createElement("div");
  messageDiv.className = "temp-message";
  messageDiv.textContent = message;

  const colors = {
    success: { bg: "rgba(39, 174, 96, 0.9)", border: "#27ae60" },
    info: { bg: "rgba(52, 152, 219, 0.9)", border: "#3498db" },
    warning: { bg: "rgba(243, 156, 18, 0.9)", border: "#f39c12" },
  };

  const color = colors[type] || colors.info;

  Object.assign(messageDiv.style, {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: color.bg,
    color: "white",
    padding: "12px 20px",
    borderRadius: "8px",
    border: `1px solid ${color.border}`,
    zIndex: "9999",
    fontSize: "14px",
    fontWeight: "500",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    backdropFilter: "blur(10px)",
    maxWidth: "90vw",
    textAlign: "center",
    lineHeight: "1.4",
  });

  document.body.appendChild(messageDiv);

  setTimeout(() => {
    if (messageDiv.parentNode) {
      messageDiv.style.opacity = "0";
      messageDiv.style.transform = "translate(-50%, -50%) scale(0.9)";
      messageDiv.style.transition = "all 0.3s ease";

      setTimeout(() => {
        if (messageDiv.parentNode) {
          messageDiv.remove();
        }
      }, 300);
    }
  }, 3000);
}

/**
* 显示诗句动画消息（带状态控制）
*/
function showPoetryMessage() {
  if (isPoetryAnimationPlaying) {
    return;
  }

  isPoetryAnimationPlaying = true;

  if (poetryAnimationTimeout) {
    clearTimeout(poetryAnimationTimeout);
    poetryAnimationTimeout = null;
  }

  const existingPoetry = document.querySelector(".poetry-message");
  if (existingPoetry) {
    existingPoetry.remove();
  }

  const poetryDiv = document.createElement("div");
  poetryDiv.className = "poetry-message";

  const poetryTexts = i18n.t('poems');
  const randomPoetry = poetryTexts[Math.floor(Math.random() * poetryTexts.length)];
  poetryDiv.textContent = randomPoetry;

  document.body.appendChild(poetryDiv);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      poetryDiv.classList.add("poetry-animate");
    });
  });

  poetryAnimationTimeout = setTimeout(() => {
    if (poetryDiv.parentNode) {
      poetryDiv.remove();
    }
    isPoetryAnimationPlaying = false;
    poetryAnimationTimeout = null;
  }, 4500);
}

/**
* 强制停止诗句动画
*/
function forceStopPoetryAnimation() {
  if (isPoetryAnimationPlaying) {
    isPoetryAnimationPlaying = false;

    if (poetryAnimationTimeout) {
      clearTimeout(poetryAnimationTimeout);
      poetryAnimationTimeout = null;
    }

    const poetryElements = document.querySelectorAll(".poetry-message");
    poetryElements.forEach((element) => {
      if (element.parentNode) {
        element.remove();
      }
    });
  }
}

// ==================== 坐标数据处理 ====================
/**
* 从地区数据构建坐标映射表
*/
function buildCoordinateMapFromRegions() {
  console.log("建立坐标映射...");

  if (regionsData && regionsData.regions) {
    regionsData.regions.forEach((region) => {
      const extPath = region.ext_path;
      const coordinates = region.coordinates;

      if (
        extPath &&
        coordinates &&
        Array.isArray(coordinates) &&
        coordinates.length === 2
      ) {
        coordinateMap.set(extPath, coordinates);
      }
    });
  }

  Object.entries(INTERNATIONAL_COORDINATES).forEach(([name, coords]) => {
    coordinateMap.set(name, coords);
  });

  console.log("坐标映射建立完成，共", coordinateMap.size, "个地点");
  console.log("国际坐标:", Object.keys(INTERNATIONAL_COORDINATES));
}

// ==================== 数据加载 ====================
/**
* 加载地理坐标数据
*/
async function loadGeographicData() {
  try {
    const response = await fetch("data/china_regions_coordinates.json");

    if (response.ok) {
      regionsData = await response.json();
      buildCoordinateMapFromRegions();
      console.log("china_regions_coordinates.json 加载成功");
    } else {
      throw new Error("china_regions_coordinates.json 加载失败");
    }

    return true;
  } catch (error) {
    console.warn("外部地理数据加载失败:", error.message);
    Object.entries(INTERNATIONAL_COORDINATES).forEach(([name, coords]) => {
      coordinateMap.set(name, coords);
    });
    console.log("已加载备用国际坐标数据");
    return true;
  }
}

/**
* 加载轨迹事件数据
* 英文版本使用英文事件描述，但坐标信息从中文数据获取（因为坐标映射基于中文地名）
*/
async function loadTrajectoryData() {
  try {
    const locale = i18n.getCurrentLocale();
    const isEnglish = locale === 'en';

    // 始终加载中文数据（用于坐标匹配）
    const zhResponse = await fetch('data/mao_trajectory_events.json');
    if (!zhResponse.ok) {
      throw new Error(
        `加载中文事件数据失败: ${zhResponse.status} - ${zhResponse.statusText}`
      );
    }
    const zhData = await zhResponse.json();

    if (
      !zhData.events ||
      !Array.isArray(zhData.events) ||
      zhData.events.length === 0
    ) {
      throw new Error("中文事件数据格式错误或为空");
    }

    // 如果是英文，加载英文数据并合并坐标信息
    if (isEnglish) {
      const enResponse = await fetch('data/mao_trajectory_events_en.json');
      if (!enResponse.ok) {
        throw new Error(
          `加载英文事件数据失败: ${enResponse.status} - ${enResponse.statusText}`
        );
      }
      const enData = await enResponse.json();

      if (
        !enData.events ||
        !Array.isArray(enData.events) ||
        enData.events.length === 0
      ) {
        throw new Error("英文事件数据格式错误或为空");
      }

      // 使用英文的事件描述，但用中文的坐标信息
      const mergedData = {
        title: enData.title,
        events: enData.events.map((enEvent, index) => {
          const zhEvent = zhData.events[index];
          return {
            ...enEvent,
            // 使用中文数据的坐标信息（因为坐标映射基于中文地名）
            coordinates: zhEvent ? zhEvent.coordinates : enEvent.coordinates
          };
        })
      };

      console.log('英文数据已与中文坐标信息合并');
      return processTrajectoryData(mergedData);
    }

    return processTrajectoryData(zhData);
  } catch (error) {
    console.error("加载轨迹数据失败:", error);
    throw error;
  }
}

// ==================== 坐标匹配 ====================
/**
* 构建完整的行政区划路径
*/
function buildFullLocationPath(locationInfo) {
  if (!locationInfo) return null;

  let parts = [];

  if (locationInfo.country && locationInfo.country !== "中国") {
    parts.push(locationInfo.country);
    if (locationInfo.city) {
      parts.push(locationInfo.city);
    }
  } else {
    if (locationInfo.province) {
      parts.push(locationInfo.province);
    }
    if (locationInfo.city) {
      parts.push(locationInfo.city);
    }
    if (locationInfo.district && locationInfo.district !== locationInfo.city) {
      parts.push(locationInfo.district);
    }
  }

  const fullPath = parts.length > 0 ? parts.join(" ") : null;

  return fullPath;
}

/**
* 根据位置信息获取坐标
*/
function getCoordinates(locationInfo) {
  if (!locationInfo) return null;

  if (locationInfo.coordinates) {
    return locationInfo.coordinates;
  }

  const fullPath = buildFullLocationPath(locationInfo);
  if (fullPath && coordinateMap.has(fullPath)) {
    return coordinateMap.get(fullPath);
  }

  console.warn("无法匹配坐标:", locationInfo, "构建路径:", fullPath);
  return null;
}

/**
* 获取坐标和格式化地点名称
*/
function getCoordinatesWithLocation(locationInfo) {
  if (!locationInfo) return { coordinates: null, location: "未知地点" };

  if (locationInfo.coordinates) {
    return {
      coordinates: locationInfo.coordinates,
      location: formatLocationName(locationInfo),
    };
  }

  const fullPath = buildFullLocationPath(locationInfo);
  const coordinates =
    fullPath && coordinateMap.has(fullPath)
      ? coordinateMap.get(fullPath)
      : null;

  return {
    coordinates: coordinates,
    location: formatLocationName(locationInfo),
  };
}

/**
* 格式化地点名称显示
*/
function formatLocationName(locationInfo) {
  if (!locationInfo) return "未知地点";

  let parts = [];

  if (locationInfo.country && locationInfo.country !== "中国") {
    parts.push(locationInfo.country);
    if (locationInfo.city) parts.push(locationInfo.city);
  } else {
    if (locationInfo.province) parts.push(locationInfo.province);
    if (locationInfo.city && locationInfo.city !== locationInfo.province) {
      parts.push(locationInfo.city);
    }
    if (locationInfo.district && locationInfo.district !== locationInfo.city) {
      parts.push(locationInfo.district);
    }
  }

  return parts.length > 0 ? parts.join(" ") : "未知地点";
}

// ==================== 轨迹数据处理 ====================
/**
* 处理原始轨迹数据，添加坐标信息
*/
function processTrajectoryData(data) {
  const processedEvents = data.events.map((event, index) => {
    const processed = {
      ...event,
      index: index,
      startCoords: null,
      endCoords: null,
      transitCoords: [],
      startLocation: null,
      endLocation: null,
    };

    if (event.coordinates && event.coordinates.start) {
      const startResult = getCoordinatesWithLocation(event.coordinates.start);
      processed.startCoords = startResult.coordinates;
      processed.startLocation = startResult.location;
    }

    if (event.coordinates && event.coordinates.end) {
      const endResult = getCoordinatesWithLocation(event.coordinates.end);
      processed.endCoords = endResult.coordinates;
      processed.endLocation = endResult.location;
    }

    if (event.coordinates && event.coordinates.transit) {
      processed.transitCoords = event.coordinates.transit
        .map((transit) => getCoordinates(transit))
        .filter((coords) => coords !== null);
    }

    if (!processed.endLocation && processed.startLocation) {
      processed.endLocation = processed.startLocation;
      processed.endCoords = processed.startCoords;
    }

    return processed;
  });

  return {
    ...data,
    events: processedEvents,
  };
}

// ==================== 位置聚合 ====================
/**
* 按地理位置聚合事件
*/
function groupEventsByLocation(events, maxIndex) {
  const groups = new Map();

  // 获取国际化的访问类型标签
  const birthLabel = i18n.t('ui.visitType.birth');
  const startLabel = i18n.t('ui.visitType.start');
  const destinationLabel = i18n.t('ui.visitType.destination');
  const transitLabel = i18n.t('ui.visitType.transit');
  const activityLabel = i18n.t('ui.visitType.activity');

  // 根据当前语言获取 movementType 标识
  const locale = i18n.getCurrentLocale();
  const birthType = locale === 'en' ? 'Birth' : '出生';
  const localActivityType = locale === 'en' ? 'Local Activity' : '原地活动';

  for (let i = 0; i <= maxIndex; i++) {
    const event = events[i];

    if (event.movementType === birthType) {
      if (event.endCoords && event.endLocation) {
        const coordKey = `${event.endCoords[0]},${event.endCoords[1]}`;

        if (!groups.has(coordKey)) {
          groups.set(coordKey, {
            coordinates: event.endCoords,
            location: event.endLocation,
            events: [],
            types: new Set(),
          });
        }

        const group = groups.get(coordKey);
        group.events.push({
          ...event,
          index: i,
          date: event.date,
          event: event.event,
          age: event.age,
          visitType: birthLabel,
        });

        group.types.add(event.movementType);
      }
    } else if (event.movementType === localActivityType) {
      if (event.endCoords && event.endLocation) {
        const coordKey = `${event.endCoords[0]},${event.endCoords[1]}`;

        if (!groups.has(coordKey)) {
          groups.set(coordKey, {
            coordinates: event.endCoords,
            location: event.endLocation,
            events: [],
            types: new Set(),
          });
        }

        const group = groups.get(coordKey);
        group.events.push({
          ...event,
          index: i,
          date: event.date,
          event: event.event,
          age: event.age,
          visitType: activityLabel,
        });

        group.types.add(event.movementType);
      }
    } else {
      if (event.startCoords && event.startLocation) {
        const coordKey = `${event.startCoords[0]},${event.startCoords[1]}`;

        if (!groups.has
