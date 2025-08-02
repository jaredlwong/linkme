import "@testing-library/jest-dom";

// Mock browser APIs that are used in linkme.ts
Object.defineProperty(window, "location", {
  value: {
    href: "https://example.com",
    hostname: "example.com",
  },
  writable: true,
});

Object.defineProperty(document, "title", {
  value: "Test Page Title",
  writable: true,
});

Object.defineProperty(document, "hasFocus", {
  value: jest.fn(() => true),
  writable: true,
});

Object.defineProperty(window, "focus", {
  value: jest.fn(),
  writable: true,
});

// Mock navigator.clipboard
Object.defineProperty(navigator, "clipboard", {
  value: {
    write: jest.fn(() => Promise.resolve()),
  },
  writable: true,
});

// Mock ClipboardItem
global.ClipboardItem = class MockClipboardItem {
  constructor(
    items: Record<string, string | Blob | PromiseLike<string | Blob>>
  ) {
    return items;
  }
  static supports(type: string): boolean {
    return true;
  }
} as any;

// Mock Blob
global.Blob = jest.fn().mockImplementation((content, options) => ({
  content,
  type: options?.type || "text/plain",
}));

// Mock alert
global.alert = jest.fn();
