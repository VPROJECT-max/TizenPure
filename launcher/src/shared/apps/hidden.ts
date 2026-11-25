// System/helper application ids that Smart Hub never shows. Ported from free-my-tv's
// SAMSUNG_HIDDEN map (MIT); see NOTICE. Kept: the browser, Netflix, Prime Video, the store,
// SmartThings, Apple TV (aria-video), TV Plus and Gaming Hub.
export const SAMSUNG_HIDDEN = new RegExp(
  "^(org\\.volt\\.|org\\.tizen\\.(?!browser$|netflix|primevideo$|globoplay|apple)|org\\.tizen\\.netflixlowmem$|ise-|ug-|d75857a5-)" +
    "|[Ss]ervice$|[Dd]aemon|Preview$|syspopup|[Hh]elper$|AdPlayer|AdSuite|[Kk]eyboard|\\.OTApp$" +
    "|^com\\.samsung\\.calendar-account-manager" +
    "|^com\\.samsung\\.tv\\.(?!store$|SmartThingsApp$|aria-video$|knox-browser-win365$|tvplus$|gaminghub$)" +
    "|^com\\.samsung\\.tizen\\." +
    "|^com\\.samsung\\.(ep[-.]|rdm[-.]|SelfDiagnosis$|mtm-banner$|hitcomp$|video-test$)" +
    "|^com\\.sausng\\." +
    "|^adplatform\\." +
    "|^(unified-drm-|lib-|p2p-asm|mobilebff$|comss$|acm-watcher$|dmr_service_app$|aifw-|csapi-|capi-|ep-|test-|emergency-log-transmitter$|samsung-easy-support$)",
);

// Never show ourselves, our test app or the watcher service.
const OWN = /^TizenPure[0H]\./;

export interface RawApp {
  readonly id?: string;
  readonly name?: string;
  readonly iconPath?: string;
  readonly show?: boolean;
}

export const visibleApp = (app: RawApp): boolean =>
  !!app.id && !OWN.test(app.id) && !SAMSUNG_HIDDEN.test(app.id) && app.show !== false;
