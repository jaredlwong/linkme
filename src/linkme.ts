type DocInfo = {
  link: string;
  title: string | null;
  html?: string; // Optional HTML content for Slack messages
  text?: string; // Optional plain text content for Slack messages
  sender?: string; // Optional sender for Slack messages
  dateString?: string; // Optional formatted date for Slack messages
  channelName?: string; // Optional channel name for Slack messages
};

interface Rule {
  isMatch: () => boolean;
  getDocInfo: () => Promise<DocInfo>;
}

class Logger {
  private logs: string[] = [];

  log(message: string): void {
    this.logs.push(message);
  }

  flush(): void {
    if (this.logs.length > 0) {
      console.log(this.logs.join("\n"));
      this.logs = [];
    }
  }
}

const logger = new Logger();

async function findElement(selector: string): Promise<Element> {
  logger.log(`Finding element: ${selector}`);
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  logger.log(`Element found: ${selector}`);
  return element;
}

function findElementByClassPrefix(
  prefix: string,
  tagName: string = "*"
): Element | null {
  logger.log(`Finding element by class prefix: ${prefix}`);
  const elements = document.querySelectorAll(`${tagName}[class*="${prefix}"]`);

  for (const element of Array.from(elements)) {
    const classList = element.className.split(" ");
    const hasMatchingClass = classList.some((className: string) =>
      className.startsWith(prefix)
    );
    if (hasMatchingClass) {
      logger.log(`Element found with class prefix: ${prefix}`);
      return element;
    }
  }

  logger.log(`No element found with class prefix: ${prefix}`);
  return null;
}

function findFirstWithDirectTextMatch(regex: RegExp): Element | null {
  // Create a condition using the regex
  const condition = createDirectTextCondition(regex);

  // Use the new findFirstInWholeDFS method
  return findFirstInWholeDFS(condition);
}

function findNextElementDFS(
  startElement: Element,
  condition: (element: Element) => boolean
): Element | null {
  let foundStart = false;

  function dfsTraversal(element: Element): Element | null {
    // If we haven't found the start element yet, check if this is it
    if (!foundStart) {
      if (element === startElement) {
        foundStart = true;
      }
      // Continue traversal to find start element and then look for matches
      for (const child of Array.from(element.children)) {
        const result = dfsTraversal(child);
        if (result) return result;
      }
      return null;
    }

    // We've found the start element, now look for matches
    // Check current element first
    if (condition(element)) {
      return element;
    }

    // Then check children (DFS order)
    for (const child of Array.from(element.children)) {
      const result = dfsTraversal(child);
      if (result) return result;
    }

    return null;
  }

  // Start traversal from document body to ensure we cover the entire DOM
  const result = dfsTraversal(document.body);
  if (result) return result;

  // If no match found in body, try from document.documentElement as fallback
  foundStart = false;
  return dfsTraversal(document.documentElement);
}

function createDirectTextCondition(
  regex: RegExp
): (element: Element) => boolean {
  return (element: Element): boolean => {
    // Get only the direct text content of this element (excluding child elements)
    let directText = "";
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === 3) {
        // TEXT_NODE = 3
        directText += node.textContent || "";
      }
    }

    return regex.test(directText);
  };
}

function findFirstInWholeDFS(
  condition: (element: Element) => boolean
): Element | null {
  // Create a dummy start element that doesn't exist in the DOM
  const dummyStart = document.createElement("div");

  // Temporarily insert the dummy element at the beginning of the body
  // This ensures findNextElementDFS will start from the very first element
  if (document.body.firstChild) {
    document.body.insertBefore(dummyStart, document.body.firstChild);
  } else {
    document.body.appendChild(dummyStart);
  }

  try {
    // Use findNextElementDFS starting from the dummy element
    const result = findNextElementDFS(dummyStart, condition);
    return result;
  } finally {
    // Always remove the dummy element
    if (dummyStart.parentNode) {
      dummyStart.parentNode.removeChild(dummyStart);
    }
  }
}

function findInParentChain(
  startElement: Element,
  selector: string
): Element | null {
  let currentElement: Element | null = startElement;

  while (currentElement) {
    // Try to find the element within the current scope
    const found = currentElement.querySelector(selector);
    if (found) {
      return found;
    }

    // Move up to the parent element
    currentElement = currentElement.parentElement;
  }

  // If we reach here, the element wasn't found in any parent
  return null;
}

function getDatadogTimeRange(): string {
  // Try to get the time range from the date picker (always include this for Datadog)
  let timeRange = "";
  try {
    const dateRangePicker = document.querySelector(
      ".druids_time_date-range-picker"
    );
    if (dateRangePicker) {
      const input = dateRangePicker.querySelector("input");
      if (input && input.value) {
        timeRange = ` (${input.value})`;
        logger.log(`Datadog: Found time range: ${input.value}`);
      }
    }
  } catch (error) {
    logger.log(`Datadog: Could not find time range: ${error}`);
  }
  return timeRange;
}

function transformQueryPart(queryPart: string): string {
  // Remove any existing aggregation functions like avg(), sum(), etc.
  let cleaned = queryPart.replace(/^(avg|sum|min|max)\([^)]*\):\s*/, "");

  // Remove any existing rollup
  cleaned = cleaned.replace(/\.rollup\([^)]*\)/, "");

  // Add count: prefix if not present, as_rate(), and rollup
  if (!cleaned.startsWith("count:")) {
    cleaned = `count:${cleaned}`;
  }

  // Add .as_rate() and rollup
  return `${cleaned}.as_rate().rollup(avg, 300)`;
}

function getMetaContent(property: string): string | null {
  const metaElement = document.querySelector(`meta[property="${property}"]`);
  return metaElement ? metaElement.getAttribute("content") : null;
}

function cleanupContent(content: string): string {
  if (!content) return content;

  // Decode HTML entities
  const textarea = document.createElement("textarea");
  textarea.innerHTML = content;
  let decoded = textarea.value;

  // Remove excessive whitespace and normalize
  decoded = decoded.replace(/\s+/g, " ").trim();

  return decoded;
}

function getTitle(): string {
  // First try Open Graph
  const ogTitle = getMetaContent("og:title");
  if (ogTitle) {
    let cleanedTitle = cleanupContent(ogTitle);
    
    // Check for books.book type and truncate at ':'
    const ogType = getMetaContent("og:type");
    if (ogType === "books.book") {
      const colonIndex = cleanedTitle.indexOf(":");
      if (colonIndex !== -1) {
        cleanedTitle = cleanedTitle.substring(0, colonIndex).trim();
        logger.log(`getTitle: Detected books.book, truncated title at colon: "${cleanedTitle}"`);
      }
    }
    
    // For YouTube-style titles, try to extract the video title from "Video Title - Channel Name"
    if (
      window.location.hostname.includes("youtube.com") ||
      window.location.hostname.includes("youtube.")
    ) {
      logger.log(
        "getTitle: Detected YouTube, attempting to extract video title"
      );
      logger.log(`getTitle: Raw og:title content: "${ogTitle}"`);
      logger.log(`getTitle: Cleaned og:title content: "${cleanedTitle}"`);
      const titleMatch = cleanedTitle.match(/^(.*) - (.+)$/);
      if (titleMatch) {
        const [, videoTitle, channelName] = titleMatch;
        logger.log(
          `getTitle: Extracted video title: "${videoTitle.trim()}" from channel: "${channelName.trim()}"`
        );
        return `${videoTitle.trim()} (${channelName.trim()})`;
      } else {
        logger.log(
          "getTitle: No channel name pattern found in og:title, checking if we can get channel from schema.org"
        );
        // Try to get channel from schema.org
        const schemaAuthor = getSchemaOrgAuthor();
        if (schemaAuthor) {
          logger.log(`getTitle: Found schema.org author: "${schemaAuthor}"`);
          return `${cleanedTitle} (${schemaAuthor})`;
        }
        logger.log("getTitle: No channel found, returning og:title as-is");
      }
    }
    return cleanedTitle;
  }

  // Then try Schema.org
  const schemaTitle = getSchemaOrgTitle();
  const schemaAuthor = getSchemaOrgAuthor();
  if (schemaTitle) {
    const cleanedTitle = cleanupContent(schemaTitle);
    if (schemaAuthor) {
      const cleanedAuthor = cleanupContent(schemaAuthor);
      logger.log(
        `getTitle: Found schema.org title "${cleanedTitle}" with author "${cleanedAuthor}"`
      );
      return `${cleanedTitle} (${cleanedAuthor})`;
    }
    return cleanedTitle;
  }

  // Finally fallback to document title
  const documentTitle = cleanupContent(document.title);

  // Handle common service patterns like "Place Name - Service Name"
  // This catches Google Maps, and other services with similar patterns
  const servicePatterns = [
    / - Google Maps$/,
    / - Google Search$/,
    / - Bing Maps$/,
    / - Apple Maps$/,
  ];

  for (const pattern of servicePatterns) {
    const match = documentTitle.match(new RegExp(`^(.*?)${pattern.source}`));
    if (match) {
      const [, placeName] = match;
      const serviceName = documentTitle.match(pattern)?.[0].replace(" - ", "");
      if (serviceName) {
        logger.log(
          `getTitle: Found service pattern - place: "${placeName}", service: "${serviceName}"`
        );
        return `${placeName} (${serviceName})`;
      }
    }
  }

  return documentTitle;
}

function getUrl(): string {
  // First try Open Graph
  const ogUrl = getMetaContent("og:url");
  if (ogUrl) {
    return cleanupContent(ogUrl);
  }

  // Then try Schema.org
  const schemaUrl = getSchemaOrgUrl();
  if (schemaUrl) {
    return cleanupContent(schemaUrl);
  }

  // Finally fallback to current URL
  return window.location.href;
}

function getSchemaOrgContent(
  itemType: string,
  property: string
): string | null {
  logger.log(`getSchemaOrgContent: Looking for ${property} in ${itemType}`);
  const itemElement = document.querySelector(
    `[itemscope][itemtype="${itemType}"]`
  );
  if (!itemElement) {
    logger.log(`getSchemaOrgContent: No element found for ${itemType}`);
    return null;
  }

  logger.log(`getSchemaOrgContent: Found element for ${itemType}`);

  // Try to find meta element with itemprop (but not nested inside other itemscopes)
  const metaElements = itemElement.querySelectorAll(
    `meta[itemprop="${property}"]`
  );
  logger.log(
    `getSchemaOrgContent: Found ${metaElements.length} meta elements for ${property}`
  );
  for (const metaElement of Array.from(metaElements)) {
    // Check if this meta element is directly under the itemType we're looking for
    const closestItemScope = metaElement.closest("[itemscope]");
    if (closestItemScope === itemElement) {
      const content = metaElement.getAttribute("content");
      logger.log(
        `getSchemaOrgContent: Found meta content for ${property}: ${content}`
      );
      return content;
    }
  }

  // Try to find link element with itemprop (but not nested inside other itemscopes)
  const linkElements = itemElement.querySelectorAll(
    `link[itemprop="${property}"]`
  );
  logger.log(
    `getSchemaOrgContent: Found ${linkElements.length} link elements for ${property}`
  );
  for (const linkElement of Array.from(linkElements)) {
    // Check if this link element is directly under the itemType we're looking for
    const closestItemScope = linkElement.closest("[itemscope]");
    if (closestItemScope === itemElement) {
      const content =
        linkElement.getAttribute("href") || linkElement.getAttribute("content");
      logger.log(
        `getSchemaOrgContent: Found link content for ${property}: ${content}`
      );
      return content;
    }
  }

  // Try to find any element with itemprop and get its text content (but not nested inside other itemscopes)
  const elements = itemElement.querySelectorAll(`[itemprop="${property}"]`);
  logger.log(
    `getSchemaOrgContent: Found ${elements.length} elements for ${property}`
  );
  for (const element of Array.from(elements)) {
    // Check if this element is directly under the itemType we're looking for
    const closestItemScope = element.closest("[itemscope]");
    if (closestItemScope === itemElement) {
      const content = element.textContent?.trim() || null;
      logger.log(
        `getSchemaOrgContent: Found element content for ${property}: ${content}`
      );
      return content;
    }
  }

  logger.log(
    `getSchemaOrgContent: No content found for ${property} in ${itemType}`
  );
  return null;
}

function getSchemaOrgPersonName(
  itemType: string,
  authorProperty: string = "author"
): string | null {
  logger.log(
    `getSchemaOrgPersonName: Looking for ${authorProperty} in ${itemType}`
  );
  const itemElement = document.querySelector(
    `[itemscope][itemtype="${itemType}"]`
  );
  if (!itemElement) {
    logger.log(`getSchemaOrgPersonName: No element found for ${itemType}`);
    return null;
  }

  // Look for author span with Person itemtype
  const authorSpan = itemElement.querySelector(
    `span[itemprop="${authorProperty}"][itemscope][itemtype="http://schema.org/Person"]`
  );
  logger.log(
    `getSchemaOrgPersonName: Found author span for ${authorProperty}: ${
      authorSpan ? "YES" : "NO"
    }`
  );

  if (authorSpan) {
    const authorLink = authorSpan.querySelector('link[itemprop="name"]');
    logger.log(
      `getSchemaOrgPersonName: Found author link: ${authorLink ? "YES" : "NO"}`
    );
    if (authorLink) {
      const content = authorLink.getAttribute("content");
      logger.log(
        `getSchemaOrgPersonName: Found author name from link: ${content}`
      );
      return content;
    }
  }

  // Also look for div with Person itemtype
  const authorDiv = itemElement.querySelector(
    `div[itemprop="${authorProperty}"][itemscope][itemtype="http://schema.org/Person"]`
  );
  logger.log(
    `getSchemaOrgPersonName: Found author div for ${authorProperty}: ${
      authorDiv ? "YES" : "NO"
    }`
  );

  if (authorDiv) {
    const authorMeta = authorDiv.querySelector('meta[itemprop="name"]');
    logger.log(
      `getSchemaOrgPersonName: Found author meta: ${authorMeta ? "YES" : "NO"}`
    );
    if (authorMeta) {
      const content = authorMeta.getAttribute("content");
      logger.log(
        `getSchemaOrgPersonName: Found author name from meta: ${content}`
      );
      return content;
    }
  }

  // Fallback: look for direct author property
  logger.log(`getSchemaOrgPersonName: Falling back to direct author property`);
  const fallbackResult = getSchemaOrgContent(itemType, authorProperty);
  logger.log(`getSchemaOrgPersonName: Fallback result: ${fallbackResult}`);
  return fallbackResult;
}

function getSchemaOrgTitle(): string | null {
  logger.log("getSchemaOrgTitle: Starting title search");
  // Common schema.org types that might have titles/names
  const commonTypes = [
    "http://schema.org/VideoObject",
    "http://schema.org/Article",
    "http://schema.org/NewsArticle",
    "http://schema.org/BlogPosting",
    "http://schema.org/WebPage",
    "http://schema.org/CreativeWork",
    "http://schema.org/Thing",
  ];

  for (const type of commonTypes) {
    logger.log(`getSchemaOrgTitle: Checking type ${type}`);
    // Check headline first (more specific for articles), then name
    const title =
      getSchemaOrgContent(type, "headline") ||
      getSchemaOrgContent(type, "name");
    if (title) {
      logger.log(`getSchemaOrgTitle: Found title for ${type}: ${title}`);
      return title;
    }
  }

  logger.log("getSchemaOrgTitle: No title found");
  return null;
}

function getSchemaOrgUrl(): string | null {
  logger.log("getSchemaOrgUrl: Starting URL search");
  // Common schema.org types that might have URLs
  const commonTypes = [
    "http://schema.org/VideoObject",
    "http://schema.org/Article",
    "http://schema.org/NewsArticle",
    "http://schema.org/BlogPosting",
    "http://schema.org/WebPage",
    "http://schema.org/CreativeWork",
    "http://schema.org/Thing",
  ];

  for (const type of commonTypes) {
    logger.log(`getSchemaOrgUrl: Checking type ${type}`);
    const url = getSchemaOrgContent(type, "url");
    if (url) {
      logger.log(`getSchemaOrgUrl: Found URL for ${type}: ${url}`);
      return url;
    }
  }

  logger.log("getSchemaOrgUrl: No URL found");
  return null;
}

function getSchemaOrgAuthor(): string | null {
  logger.log("getSchemaOrgAuthor: Starting author search");
  // Common schema.org types that might have authors
  const commonTypes = [
    "http://schema.org/VideoObject",
    "http://schema.org/Article",
    "http://schema.org/NewsArticle",
    "http://schema.org/BlogPosting",
    "http://schema.org/CreativeWork",
  ];

  for (const type of commonTypes) {
    logger.log(`getSchemaOrgAuthor: Checking type ${type}`);
    const author = getSchemaOrgPersonName(type, "author");
    if (author) {
      logger.log(`getSchemaOrgAuthor: Found author for ${type}: ${author}`);
      return author;
    }
  }

  logger.log("getSchemaOrgAuthor: No author found");
  return null;
}

const dropboxPaper: Rule = {
  isMatch: () => window.location.hostname === "paper.dropbox.com",
  getDocInfo: async () => {
    const header = await findElement(".hp-header-title-wrapper");
    const title = header.textContent;
    const link = window.location.href;
    return { link, title: `${title} (Paper)` };
  },
};

const amazon: Rule = {
  isMatch: () =>
    window.location.hostname.includes("amazon.com") &&
    !window.location.hostname.includes("aws"),
  getDocInfo: async () => {
    const productTitle = await findElement("#productTitle");
    const asin = (await findElement("#ASIN")) as HTMLInputElement;
    const title = productTitle.textContent;
    const link = `https://www.amazon.com/dp/${asin.value}`;
    return { link, title };
  },
};

const awsDocs: Rule = {
  isMatch: () => window.location.hostname === "aws.amazon.com",
  getDocInfo: async () => {
    const title = document.title;
    const link = window.location.href;

    // Check if title ends with " - ServiceName" pattern
    const match = title.match(/^(.*) - (.+)$/);
    if (match) {
      const [, content, service] = match;
      return { link, title: `${service}: ${content}` };
    }

    // If no match, return title as-is
    return { link, title };
  },
};

const docsAndDesignTools: Rule = {
  isMatch: () =>
    (window.location.hostname.includes("figma.com") &&
      !window.location.hostname.includes("temporal-eks.figma.com") &&
      !window.location.hostname.includes("temporal-eks.staging.figma.com")) ||
    window.location.hostname.includes("docs.google.com"),
  getDocInfo: async () => {
    const title = document.title;

    // Strip query parameters from URL
    const url = new URL(window.location.href);
    const link = `${url.origin}${url.pathname}`;

    // Transform title from "Title – Product" or "Title - Product" to "Title (Product)"
    // Handle both em dash (–) and regular dash (-), splitting on the last occurrence
    if (title.includes(" – ") || title.includes(" - ")) {
      const lastEmDash = title.lastIndexOf(" – ");
      const lastHyphen = title.lastIndexOf(" - ");

      // Use whichever dash appears last in the title
      const lastSeparatorIndex = Math.max(lastEmDash, lastHyphen);
      if (lastSeparatorIndex > -1) {
        const content = title.substring(0, lastSeparatorIndex);
        const product = title.substring(lastSeparatorIndex + 3); // Both separators are 3 characters
        return { link, title: `${content} (${product})` };
      }
    }

    // If no match, return title as-is
    return { link, title };
  },
};


const graphiteFigma: Rule = {
  isMatch: () =>
    window.location.href.startsWith(
      "https://app.graphite.dev/github/pr/figma/figma"
    ),
  getDocInfo: async () => {
    // Extract PR number from URL
    // URL format: https://app.graphite.dev/github/pr/figma/figma/529307/generate_signed_url-Add-sorbet-types-and-deprecate-policy-param
    const urlParts = window.location.pathname.split("/");
    const prNumber = urlParts[5]; // ['', 'github', 'pr', 'figma', 'figma', '529307', ...]

    // Parse document title to extract PR title
    // Format: "#529307 generate_signed_url: Add sorbet types and deprecate policy param - Graphite"
    const title = document.title
      .replace(/^#\d+\s+/, "")
      .replace(/\s+-\s+Graphite$/, "");

    // Find the GitHub handle from img alt attribute
    // Look for a container with CodeDiff_ class prefix
    const codeDiffContainer = findElementByClassPrefix("CodeDiff_", "div");
    let author = "";

    if (codeDiffContainer) {
      // Look for avatar image within the container
      const avatarImg = codeDiffContainer.querySelector(
        'img[src*="avatars.githubusercontent.com"]'
      );
      if (avatarImg) {
        author = avatarImg.getAttribute("alt") || "";
      }
    }

    const link = `https://github.com/figma/figma/pull/${prNumber}`;
    const formattedTitle = author ? `[PR] ${title} (${author})` : `[PR] ${title}`;
    return { link, title: formattedTitle };
  },
};

class FigmaGithub implements Rule {
  isMatch() {
    return window.location.href.startsWith(
      "https://github.com/figma/figma/pull/"
    );
  }

  async getDocInfo(): Promise<DocInfo> {
    const { title, author } = this.parsePRString(document.title);
    const link = window.location.href;

    const formattedTitle = `[PR] ${title} (${author})`;
    return { link, title: formattedTitle };
  }

  parsePRString(prString: string): {
    title: string;
    author: string;
    pr: string;
    repo: string;
  } {
    const regex =
      /(?<title>.*) by (?<author>.*) · Pull Request #(?<pr>\d+) · (?<repo>.*)/;
    const match = prString.match(regex);

    if (match?.groups) {
      return {
        title: match.groups.title,
        author: match.groups.author,
        pr: match.groups.pr,
        repo: match.groups.repo,
      };
    } else {
      throw new Error("Invalid PR string");
    }
  }
}

const githubCommit: Rule = {
  isMatch: () => window.location.href.includes("/commit/"),
  getDocInfo: async () => {
    const title = document.title;
    // Remove fragment from URL (everything after #)
    const url = new URL(window.location.href);
    const link = `${url.origin}${url.pathname}`;

    // Extract commit message from title like "sinatra: Blobstore ... · figma/figma@b95da06"
    const match = title.match(/^(.*) · /);
    if (match) {
      const [, commitMessage] = match;
      return { link, title: commitMessage };
    }

    // If no match, return title as-is
    return { link, title };
  },
};

const datadogGeneral: Rule = {
  isMatch: () =>
    window.location.hostname.includes("datadoghq.com") ||
    window.location.hostname.includes("ddog-gov.com"),
  getDocInfo: async () => {
    const title = document.title;
    const link = window.location.href;

    // Get the time range from the date picker using helper function
    const timeRange = getDatadogTimeRange();

    // General Datadog page - just add time range if available
    return { link, title: `${title}${timeRange}` };
  },
};

const datadogMonitor: Rule = {
  isMatch: () =>
    (window.location.hostname.includes("datadoghq.com") ||
      window.location.hostname.includes("ddog-gov.com")) &&
    window.location.pathname.includes("/monitors/"),
  getDocInfo: async () => {
    logger.log("datadogMonitor: Starting getDocInfo");

    // Get the time range from the date picker using helper function
    const timeRange = getDatadogTimeRange();

    // Algorithm:
    // 1. Get h1 element text
    // 2. Find all h3 elements that contain the h1 text and have trigger conditions
    // 3. Select the first matching h3 element
    // 4. Extract trigger conditions and move them to the end
    
    let h1Text = "";
    try {
      const h1Element = await findElement("h1");
      h1Text = (h1Element.textContent || "").trim();
      logger.log(`datadogMonitor: Found h1 text: ${h1Text}`);
    } catch (error) {
      logger.log(`datadogMonitor: Could not find h1 element: ${error}`);
    }

    // Find all h3 elements
    const h3Elements = document.querySelectorAll("h3");
    logger.log(`datadogMonitor: Found ${h3Elements.length} h3 elements`);

    let alertElement = null;
    let alertType = "";

    for (const h3Element of Array.from(h3Elements)) {
      const fullText = h3Element.textContent || "";
      logger.log(`datadogMonitor: Checking h3: ${fullText}`);

      // Check if this h3 has a trigger condition
      const hasTriggerCondition = fullText.includes("[Triggered") || fullText.includes("[Warn");
      
      // If h1 text exists, check if h3 contains it. If no h1 text, any h3 with trigger is valid
      const containsH1Text = h1Text ? fullText.includes(h1Text) : true;

      logger.log(`datadogMonitor: h1Text="${h1Text}", containsH1Text=${containsH1Text}, hasTriggerCondition=${hasTriggerCondition}`);

      if (containsH1Text && hasTriggerCondition) {
        alertElement = h3Element;
        if (fullText.includes("[Triggered")) {
          alertType = "Triggered";
        } else if (fullText.includes("[Warn")) {
          alertType = "Warn";
        }
        logger.log(`datadogMonitor: Selected h3 with alertType: ${alertType}`);
        break; // Select the first matching h3
      }
    }

    // If we found a matching alert element, process it
    if (alertElement && alertType) {
      const fullText = alertElement.textContent || "";
      logger.log(`datadogMonitor: Processing fullText: ${fullText}`);

      // Remove "[Triggered] " or "[Warn] " from the beginning
      let title = fullText.replace(new RegExp(`^\\[${alertType}\\]\\s*`), "");
      logger.log(`datadogMonitor: After removing ${alertType}: ${title}`);

      // Only move curly bracket tags with colons to the end (like {env:production})
      // Keep square bracket tags in their original position
      const curlyTags = title.match(/\{[^}]*:[^}]*\}/g) || [];
      
      if (curlyTags.length > 0) {
        // Check if any curly tag was at the end of the original text (should preserve space)
        const wasAtEnd = title.trim().endsWith(curlyTags[curlyTags.length - 1]);
        
        // Remove curly bracket tags from the main content
        let cleanedTitle = title;
        for (const tag of curlyTags) {
          // Remove the tag and any surrounding whitespace
          cleanedTitle = cleanedTitle.replace(new RegExp(`\\s*${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'g'), ' ');
        }
        
        // Clean up extra whitespace
        cleanedTitle = cleanedTitle.replace(/\s+/g, ' ').trim();
        
        // Add curly bracket tags to the end
        // If the tag was at the end originally, preserve space; otherwise no space
        const spaceBeforeTags = wasAtEnd ? ' ' : '';
        title = `${cleanedTitle}${spaceBeforeTags}${curlyTags.join('')}`;
        logger.log(`datadogMonitor: Moved curly tags to end: ${title}`);
      }

      const link = window.location.href;
      const finalTitle = `${title}${timeRange}`;
      logger.log(`datadogMonitor: Final title: ${finalTitle}`);
      return { link, title: finalTitle };
    }

    logger.log("datadogMonitor: No matching alert element found, using h1 fallback");
    // Fallback to h1 element if no matching alert element found
    if (h1Text) {
      const link = window.location.href;
      const finalTitle = `${h1Text}${timeRange}`;
      return { link, title: finalTitle };
    }

    // Final fallback to document title
    const title = document.title;
    const link = window.location.href;
    const finalTitle = `${title}${timeRange}`;
    return { link, title: finalTitle };
  },
};

const datadogNotebook: Rule = {
  isMatch: () =>
    window.location.hostname.includes("datadoghq.com") &&
    window.location.pathname.includes("/notebook/"),
  getDocInfo: async () => {
    const title = document.title;
    const link = window.location.href; // Keep URL with query parameters

    // Get the time range from the date picker using helper function
    const timeRange = getDatadogTimeRange();

    // Transform title from "Title | Datadog" to "Title (Datadog Notebook)"
    const match = title.match(/^(.*) \| Datadog$/);
    if (match) {
      const [, content] = match;
      return { link, title: `${content}${timeRange} (Datadog Notebook)` };
    }

    // If no match, return title as-is
    return { link, title: `${title}${timeRange}` };
  },
};

const notion: Rule = {
  isMatch: () => window.location.hostname.includes("notion.so"),
  getDocInfo: async () => {
    let title = document.title;
    const link = window.location.href;

    // Strip notification numbers like "(1) " from the beginning
    const notificationMatch = title.match(/^\(\d+\)\s*(.*)$/);
    if (notificationMatch) {
      title = notificationMatch[1];
    }

    // Add (Notion) to the end
    return { link, title: `${title} (Notion)` };
  },
};

const asana: Rule = {
  isMatch: () => window.location.hostname === "app.asana.com",
  getDocInfo: async () => {
    const title = document.title;

    // Always add ?focus=true to the URL
    const url = new URL(window.location.href);
    url.searchParams.set("focus", "true");
    const link = url.toString();

    // Transform title from "Title - Asana" to "Title (Asana)"
    // Also handle prefixes like "● Team Name - Title - Asana"
    const match = title.match(/^(.*) - Asana$/);
    if (match) {
      let [, content] = match;

      // Remove team prefixes like "● FigFile Content Team - "
      const teamPrefixMatch = content.match(/^● .+ - (.*)$/);
      if (teamPrefixMatch) {
        content = teamPrefixMatch[1];
      }

      return { link, title: `${content} (Asana)` };
    }

    // If no match, return title as-is
    return { link, title };
  },
};

const greenhouse: Rule = {
  isMatch: () => window.location.href.includes("/scorecards/"),
  getDocInfo: async () => {
    const nameElement = await findElement("h3.name");
    const name = cleanupContent(nameElement.textContent || "");

    // Remove /edit from the URL if present
    let link = window.location.href;
    if (link.endsWith("/edit")) {
      link = link.slice(0, -5);
    }

    return { link, title: `${name} (Greenhouse Scorecard)` };
  },
};

const datadogLogs: Rule = {
  isMatch: () =>
    window.location.hostname.includes("datadoghq.com") &&
    window.location.pathname.includes("/logs"),
  getDocInfo: async () => {
    const title = document.title;
    const link = window.location.href;

    // Get the time range from the date picker using helper function
    const timeRange = getDatadogTimeRange();

    // First priority: Look for "Log Message" text and find the next code element
    logger.log("datadogLogs: Looking for Log Message element");
    const logMessageCondition = createDirectTextCondition(/Log Message/);
    const logMessageElement = findFirstInWholeDFS(logMessageCondition);

    if (logMessageElement) {
      logger.log(
        "datadogLogs: Found Log Message element, looking for next code element"
      );
      const codeCondition = (element: Element) => element.tagName === "CODE";
      const codeElement = findNextElementDFS(logMessageElement, codeCondition);

      if (codeElement) {
        const logText = (codeElement.textContent || "")
          .replace(/\s+/g, " ") // Replace multiple whitespace with single space
          .trim(); // Remove leading/trailing whitespace
        logger.log(`datadogLogs: Found code element with text: ${logText}`);
        return { link, title: `${logText}${timeRange} (Logs)` };
      }
    }

    // Second priority: Try to extract the query parameter from the URL
    const urlParams = new URLSearchParams(window.location.search);
    const queryParam = urlParams.get("query");

    if (queryParam) {
      // URL decode the query parameter
      const decodedQuery = decodeURIComponent(queryParam);
      return { link, title: `${decodedQuery}${timeRange} (Logs)` };
    }

    // Final fallback: use the document title
    return { link, title: `${title}${timeRange} (Logs)` };
  },
};

const temporal: Rule = {
  isMatch: () =>
    window.location.hostname.includes("temporal-eks.figma.com") ||
    window.location.hostname.includes("temporal-eks.staging.figma.com"),
  getDocInfo: async () => {
    const title = document.title;
    const link = window.location.href;

    // Try to extract the query parameter from the URL
    const urlParams = new URLSearchParams(window.location.search);
    const queryParam = urlParams.get("query");

    if (queryParam) {
      // URL decode the query parameter
      const decodedQuery = decodeURIComponent(queryParam);
      return { link, title: `${decodedQuery} (Temporal)` };
    }

    // If no query parameter, use the document title
    return { link, title: `${title} (Temporal)` };
  },
};

const launchDarkly: Rule = {
  isMatch: () => {
    logger.log(
      `LaunchDarkly isMatch check - hostname: ${window.location.hostname}`
    );
    const result = window.location.hostname === "app.launchdarkly.com";
    logger.log(`LaunchDarkly isMatch result: ${result}`);
    return result;
  },
  getDocInfo: async () => {
    logger.log("LaunchDarkly getDocInfo started");
    const title = document.title;
    logger.log(`LaunchDarkly title: ${title}`);

    const pathname = window.location.pathname;
    logger.log(`LaunchDarkly pathname: ${pathname}`);

    // Transform the URL if it's a flag page - using simple string operations
    logger.log("LaunchDarkly: Checking if flag page...");
    const isFlagPage = pathname.indexOf("/projects/default/flags/") !== -1;
    logger.log(`LaunchDarkly: Is flag page: ${isFlagPage}`);

    if (isFlagPage) {
      logger.log("LaunchDarkly: Processing flag page");

      // Extract flag name using simple string operations instead of complex array methods
      logger.log("LaunchDarkly: Extracting flag name...");
      const flagsIndex = pathname.indexOf("/projects/default/flags/");
      const afterFlags = pathname.substring(
        flagsIndex + "/projects/default/flags/".length
      );
      logger.log(`LaunchDarkly afterFlags: ${afterFlags}`);

      const nextSlash = afterFlags.indexOf("/");
      const flagName =
        nextSlash === -1 ? afterFlags : afterFlags.substring(0, nextSlash);
      logger.log(`LaunchDarkly flagName: ${flagName}`);

      // Build new URL using simple string concatenation
      logger.log("LaunchDarkly: Building new URL...");
      const baseUrl = `${window.location.protocol}//${window.location.host}`;
      const newPath = pathname.replace("/targeting", "/monitoring");
      const queryParams =
        "env=production&env=staging&env=gov&env=development&env=devenv01&selected-env=production&activity=true";
      const newLink = `${baseUrl}${newPath}?${queryParams}`;
      logger.log(`LaunchDarkly: New URL: ${newLink}`);

      const result = {
        link: newLink,
        title: `${flagName} (LaunchDarkly)`,
      };
      logger.log(`LaunchDarkly flag result: ${JSON.stringify(result)}`);
      return result;
    }

    logger.log("LaunchDarkly: Processing non-flag page");
    // For non-flag pages, return as-is
    const result = {
      link: window.location.href,
      title: `${title} (LaunchDarkly)`,
    };
    logger.log(`LaunchDarkly non-flag result: ${JSON.stringify(result)}`);
    return result;
  },
};

const figmaDeploys: Rule = {
  isMatch: () => window.location.hostname === "deploysv2.figma.com",
  getDocInfo: async () => {
    // Extract chain ID from URL path (e.g., /pipeline-chain/631490 -> 631490)
    const pathParts = window.location.pathname.split("/");
    const chainId = pathParts[pathParts.length - 1];

    try {
      const h4Element = await findElement("h4");
      const h4Text = h4Element.textContent || "";
      const link = window.location.href;

      // If h4 already contains the chain ID, use it as-is, otherwise append it
      let title = h4Text;
      if (h4Text && !h4Text.includes(`#${chainId}`)) {
        title = `${h4Text} #${chainId}`;
      }

      return { link, title: `${title} (Figma Deploys)` };
    } catch (error) {
      logger.log(`figmaDeploys: Error finding h4 element: ${error}`);
      // Fallback to document title if h4 not found
      const title = document.title;
      const link = window.location.href;
      return { link, title: `${title} #${chainId} (Figma Deploys)` };
    }
  },
};

const goodreads: Rule = {
  isMatch: () => window.location.hostname === "www.goodreads.com",
  getDocInfo: async () => {
    logger.log("goodreads: Starting getDocInfo");
    
    // Get the base title and link using fallback logic
    const link = getUrl();
    let title = getTitle();
    
    logger.log(`goodreads: Base title: "${title}"`);
    
    // Try to get the author from ContributorLink
    try {
      const contributorLinks = document.querySelectorAll(".ContributorLink");
      logger.log(`goodreads: Found ${contributorLinks.length} ContributorLink elements`);
      
      if (contributorLinks.length > 0) {
        const authorName = contributorLinks[0].textContent?.trim();
        if (authorName) {
          logger.log(`goodreads: Found author: "${authorName}"`);
          title = `${title} by ${authorName}`;
        }
      }
    } catch (error) {
      logger.log(`goodreads: Error getting author: ${error}`);
    }
    
    logger.log(`goodreads: Final title: "${title}"`);
    return { link, title };
  },
};

const slack: Rule = {
  isMatch: () => window.location.hostname.includes("slack.com"),
  getDocInfo: async () => {
    logger.log("slack: Starting getDocInfo");

    try {
      // First try to find span with "Saved for later" text (may include additional text like "Due in X days")
      logger.log("slack: Looking for span with 'Saved for later' text");
      let referenceElement = findFirstWithDirectTextMatch(/^Saved for later/);

      if (!referenceElement) {
        // Fallback: try to find button with exact direct text "Also sent to the channel"
        logger.log(
          "slack: 'Saved for later' not found, trying fallback 'Also sent to the channel' button"
        );
        referenceElement = findFirstWithDirectTextMatch(
          /^Also sent to the channel$/
        );

        if (!referenceElement) {
          throw new Error(
            "Could not find 'Saved for later' span or 'Also sent to the channel' button"
          );
        }

        logger.log(
          "slack: Found 'Also sent to the channel' button as fallback"
        );
      } else {
        logger.log("slack: Found 'Saved for later' span");
      }

      logger.log("slack: Looking for next message content div");

      // Find the next div with data-qa="message_content" or data-qa="message-text"
      const messageContentCondition = (element: Element) => {
        return (
          element.tagName === "DIV" &&
          (element.getAttribute("data-qa") === "message_content" ||
            element.getAttribute("data-qa") === "message-text")
        );
      };

      const messageContentDiv = findNextElementDFS(
        referenceElement,
        messageContentCondition
      );

      if (!messageContentDiv) {
        throw new Error("Could not find message content div");
      }

      logger.log("slack: Found message content div, extracting content");
      logger.log(
        `slack: Message content div HTML preview: ${messageContentDiv.outerHTML.substring(
          0,
          200
        )}...`
      );

      // Find the message sender using data-stringify-text attribute
      let sender = "";
      const senderSpan = messageContentDiv.querySelector(
        '[data-qa="message_sender"]'
      );
      if (senderSpan) {
        sender = senderSpan.getAttribute("data-stringify-text") || "";
        logger.log(`slack: Found sender: ${sender}`);
      }

      // Find the timestamp link element using parent chain search
      logger.log(
        "slack: Searching for timestamp link starting from message content div"
      );
      let timestampLink = findInParentChain(
        messageContentDiv,
        "a.c-timestamp[data-ts]"
      );

      if (!timestampLink) {
        logger.log(
          "slack: c-timestamp selector not found, trying alternative data-ts selector"
        );
        timestampLink = findInParentChain(messageContentDiv, "a[data-ts]");
      }

      if (timestampLink) {
        logger.log("slack: Found timestamp link in parent chain");
      } else {
        logger.log("slack: No timestamp link found in parent chain");
      }

      let href = window.location.href;
      let dateString = "";
      let channelName = "";

      if (timestampLink) {
        href = timestampLink.getAttribute("href") || window.location.href;
        const dataTs = timestampLink.getAttribute("data-ts");

        logger.log(
          `slack: Found timestamp link with href: ${href}, data-ts: ${dataTs}`
        );

        // Extract channel ID from URL if it matches the pattern
        const channelMatch = href.match(/\/archives\/([C][A-Z0-9]+)\//);
        if (channelMatch) {
          const channelId = channelMatch[1];
          logger.log(`slack: Found channel ID: ${channelId}`);

          // Try to find the channel name using data-channel-id
          const channelElement = document.querySelector(
            `[data-channel-id="${channelId}"]`
          );
          if (channelElement) {
            const channelText = channelElement.textContent?.trim() || "";
            logger.log(`slack: Found channel element text: "${channelText}"`);

            // Clean up the channel name - remove "Message " prefix and extra whitespace
            if (channelText) {
              channelName = channelText.replace(/^\s*Message\s+/, "").trim();
              logger.log(`slack: Extracted channel name: "${channelName}"`);
            }
          }
        }

        if (dataTs) {
          // data-ts is in Unix timestamp format with microseconds (e.g., "1753899619.438709")
          const timestamp = parseFloat(dataTs) * 1000; // Convert to milliseconds
          const date = new Date(timestamp);

          // Format as "Jul 24, 2025 at 5:11PM ET"
          const options: Intl.DateTimeFormatOptions = {
            timeZone: "America/New_York",
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          };

          const formatter = new Intl.DateTimeFormat("en-US", options);
          const formattedDate = formatter.format(date);
          dateString = `${formattedDate} ET`;

          logger.log(
            `slack: Converted timestamp ${dataTs} to ${formattedDate} ET`
          );
        }
      }

      // Extract the actual message content (excluding sender and timestamp)
      const messageTextDiv = messageContentDiv.querySelector(
        '[data-qa="message-text"]'
      );
      let messageHtml = "";
      let messageText = "";

      if (messageTextDiv) {
        messageHtml = messageTextDiv.innerHTML;
        messageText = messageTextDiv.textContent?.trim() || "";
        logger.log(
          `slack: Found message text: ${messageText.substring(0, 100)}...`
        );
      } else {
        // Fallback to the whole content
        messageHtml = messageContentDiv.innerHTML;
        messageText =
          (messageContentDiv as HTMLElement).innerText ||
          messageContentDiv.textContent ||
          "";
      }

      // Create the title (just the message text for the clipboard text format)
      const title = messageText;

      logger.log(`slack: Final title: ${title}`);
      logger.log(`slack: Final link: ${href}`);

      // Store both HTML and text versions for clipboard, plus sender, date, and channel for the link
      return {
        link: href,
        title,
        html: messageHtml, // Store HTML for clipboard
        text: messageText, // Store plain text for clipboard
        sender, // Store sender for "View in Slack" link
        dateString, // Store formatted date for "View in Slack" link
        channelName, // Store channel name for "View in Slack" link
      };
    } catch (error) {
      logger.log(`slack: Error in getDocInfo: ${error}`);
      // Fallback to default behavior
      const title = document.title;
      const link = window.location.href;
      return { link, title: `${title} (Slack)` };
    }
  },
};

export {
  findElementByClassPrefix,
  findFirstWithDirectTextMatch,
  findNextElementDFS,
  createDirectTextCondition,
  findFirstInWholeDFS,
  findInParentChain,
  getDatadogTimeRange,
};

export async function getDocInfo(): Promise<DocInfo> {
  logger.log("getDocInfo() started");
  ////////////////////////////////////////////////////////////////////////////////
  // NEW RULES GO HERE
  ////////////////////////////////////////////////////////////////////////////////
  const rules: { name: string; rule: Rule }[] = [
    { name: "graphiteFigma", rule: graphiteFigma },
    { name: "FigmaGithub", rule: new FigmaGithub() },
    { name: "figmaDeploys", rule: figmaDeploys },
    { name: "docsAndDesignTools", rule: docsAndDesignTools },
    { name: "dropboxPaper", rule: dropboxPaper },
    { name: "amazon", rule: amazon },
    { name: "awsDocs", rule: awsDocs },
    { name: "githubCommit", rule: githubCommit },
    { name: "datadogMonitor", rule: datadogMonitor },
    { name: "datadogNotebook", rule: datadogNotebook },
    { name: "datadogLogs", rule: datadogLogs },
    { name: "datadogGeneral", rule: datadogGeneral }, // General Datadog rule should come after specific ones
    { name: "temporal", rule: temporal },
    { name: "notion", rule: notion },
    { name: "asana", rule: asana },
    { name: "greenhouse", rule: greenhouse },
    { name: "launchDarkly", rule: launchDarkly },
    { name: "goodreads", rule: goodreads },
    { name: "slack", rule: slack },
  ];

  logger.log(`Checking ${rules.length} rules`);

  for (let i = 0; i < rules.length; i++) {
    const { name, rule } = rules[i];
    logger.log(`Checking rule ${i}: ${name}`);

    try {
      const isMatch = rule.isMatch();
      logger.log(`Rule ${i} (${name}) isMatch result: ${isMatch}`);

      if (isMatch) {
        logger.log(`✓ Rule matched: ${name}`);
        logger.log(`About to call getDocInfo for ${name}`);
        const res = await rule.getDocInfo();
        logger.log(`✓ ${name} result: ${JSON.stringify(res)}`);
        return res;
      }
    } catch (error) {
      logger.log(`✗ Error in rule ${i} (${name}): ${error}`);
      continue; // Try next rule
    }
  }

  logger.log("No rules matched, using fallback");
  // Default fallback: try Open Graph tags first, then document properties
  const fallbackResult = { link: getUrl(), title: getTitle() };
  logger.log(`Fallback result: ${JSON.stringify(fallbackResult)}`);
  return fallbackResult;
}

async function copyToClipboard({
  title,
  link,
  html,
  text,
  sender,
  dateString,
  channelName,
}: DocInfo): Promise<void> {
  logger.log("Starting clipboard copy...");

  let clipboardText: string;
  let clipboardHtml: string;

  if (html && text) {
    // For Slack messages, use the HTML content and create a link with sender, date, and channel
    logger.log("Using Slack-specific HTML content");
    clipboardText = `${text} (${link})`; // Plain text with link

    // Create the "View in Slack" link with sender, date, and channel
    let slackLinkParts = ["View in Slack"];

    if (sender) {
      slackLinkParts.push(sender);
    }

    if (channelName) {
      slackLinkParts.push(`#${channelName}`);
    }

    if (dateString) {
      slackLinkParts.push(dateString);
    }

    const slackLinkText = slackLinkParts.join(" - ");

    clipboardHtml = `<div>${html}</div><p><a href="${link}">${slackLinkText}</a></p>`; // HTML content with link
  } else {
    // Standard markdown format for other sites
    // Escape square brackets in title for markdown
    const escapedTitle = title
      ? title.replace(/\[/g, "\\[").replace(/\]/g, "\\]")
      : "";
    clipboardText = `[${escapedTitle}](${link})`;
    clipboardHtml = `<a href="${link}">${title || ""}</a>`;
  }

  logger.log(`Prepared text: ${clipboardText}`);
  logger.log(`Prepared html: ${clipboardHtml.substring(0, 200)}...`);

  if (!document.hasFocus()) {
    logger.log("Document not focused, focusing window...");
    window.focus();
  }

  // Add timeout to prevent infinite hangs
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Clipboard operation timed out")), 5000);
  });

  try {
    logger.log("Attempting clipboard write...");

    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.write) {
      logger.log("Using modern clipboard API");
      await Promise.race([
        navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([clipboardText], { type: "text/plain" }),
            "text/html": new Blob([clipboardHtml], { type: "text/html" }),
          }),
        ]),
        timeoutPromise,
      ]);
      logger.log("Modern clipboard write successful");
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      logger.log("Using fallback clipboard.writeText");
      await Promise.race([
        navigator.clipboard.writeText(clipboardText),
        timeoutPromise,
      ]);
      logger.log("Fallback clipboard write successful");
    } else {
      logger.log("Using legacy clipboard method");
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = clipboardText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      logger.log("Legacy clipboard write successful");
    }
  } catch (error) {
    console.error("Clipboard error:", error);
    // Show user-friendly error
    const errorMessage = error instanceof Error ? error.message : String(error);
    alert(
      `Failed to copy to clipboard: ${errorMessage}\n\nText: ${clipboardText}`
    );
    throw error;
  }
}

// Only run the main script if we're not in a test environment
if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
  (async () => {
    // Add overall timeout to prevent infinite hangs
    const overallTimeout = setTimeout(() => {
      logger.log("Script timed out after 10 seconds");
      logger.flush();
      alert("Linkme script timed out - Firefox may have compatibility issues");
    }, 10000);

    try {
      logger.log("Starting linkme script...");
      logger.log(`Browser: ${navigator.userAgent}`);
      logger.log(`Current URL: ${window.location.href}`);

      const docInfo = await getDocInfo();
      logger.log(`Copying to clipboard: ${JSON.stringify(docInfo)}`);

      await copyToClipboard(docInfo);
      logger.log("Script completed successfully");
      logger.flush();
      clearTimeout(overallTimeout);
    } catch (error) {
      logger.log(`Script failed: ${error}`);
      logger.flush();
      console.error("Script failed:", error);
      clearTimeout(overallTimeout);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Linkme script failed: ${errorMessage}`);
    }
  })();
}
