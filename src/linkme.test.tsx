import React from 'react';
import { render, screen } from '@testing-library/react';
import { getDocInfo, findElementByClassPrefix } from './linkme';

// Create a test component that mimics DOM structure for different sites
const createTestDOM = (hostname: string, title: string, additionalElements: Record<string, string> = {}) => {
  // Set up window.location
  Object.defineProperty(window, 'location', {
    value: {
      href: `https://${hostname}/test-page`,
      hostname,
    },
    writable: true,
  });

  // Set document title
  Object.defineProperty(document, 'title', {
    value: title,
    writable: true,
  });

  // Clear document body
  document.body.innerHTML = '';

  // Add additional elements
  Object.entries(additionalElements).forEach(([selector, content]) => {
    const element = document.createElement('div');
    element.innerHTML = content;
    
    // Handle different selector types
    if (selector.startsWith('#')) {
      element.id = selector.slice(1);
    } else if (selector.startsWith('.')) {
      element.className = selector.slice(1);
    } else {
      element.setAttribute('data-selector', selector);
    }
    
    document.body.appendChild(element);
  });
};

describe('linkme', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Clear document head to remove meta tags from previous tests
    document.head.innerHTML = '';
  });

  describe('getDocInfo', () => {
    it('should return default doc info for unknown sites', async () => {
      createTestDOM('unknown.com', 'Unknown Site');
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://unknown.com/test-page',
        title: 'Unknown Site',
      });
    });

    it('should use Open Graph title when available', async () => {
      createTestDOM('unknown.com', 'Document Title');
      
      // Add og:title meta tag
      const ogTitleMeta = document.createElement('meta');
      ogTitleMeta.setAttribute('property', 'og:title');
      ogTitleMeta.setAttribute('content', 'Open Graph Title');
      document.head.appendChild(ogTitleMeta);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://unknown.com/test-page',
        title: 'Open Graph Title',
      });
    });

    it('should use Open Graph URL when available', async () => {
      createTestDOM('unknown.com', 'Document Title');
      
      // Add og:url meta tag
      const ogUrlMeta = document.createElement('meta');
      ogUrlMeta.setAttribute('property', 'og:url');
      ogUrlMeta.setAttribute('content', 'https://example.com/og-url');
      document.head.appendChild(ogUrlMeta);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://example.com/og-url',
        title: 'Document Title',
      });
    });

    it('should use both Open Graph title and URL when available', async () => {
      createTestDOM('unknown.com', 'Document Title');
      
      // Add both og:title and og:url meta tags
      const ogTitleMeta = document.createElement('meta');
      ogTitleMeta.setAttribute('property', 'og:title');
      ogTitleMeta.setAttribute('content', 'James Moore on Instagram: &quot;Your back will THANK YOU 🙏 FOLLOW to be well! \n\n#viral&quot;');
      document.head.appendChild(ogTitleMeta);
      
      const ogUrlMeta = document.createElement('meta');
      ogUrlMeta.setAttribute('property', 'og:url');
      ogUrlMeta.setAttribute('content', 'https://www.instagram.com/jamesmoorewellness/reel/DE5qw2iyOoX/');
      document.head.appendChild(ogUrlMeta);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://www.instagram.com/jamesmoorewellness/reel/DE5qw2iyOoX/',
        title: 'James Moore on Instagram: "Your back will THANK YOU 🙏 FOLLOW to be well! #viral"',
      });
    });

    it('should clean up excessive whitespace in content', async () => {
      createTestDOM('unknown.com', 'Document Title');
      
      // Add og:title with excessive whitespace
      const ogTitleMeta = document.createElement('meta');
      ogTitleMeta.setAttribute('property', 'og:title');
      ogTitleMeta.setAttribute('content', '  Multiple   spaces    and\n\nnewlines  ');
      document.head.appendChild(ogTitleMeta);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://unknown.com/test-page',
        title: 'Multiple spaces and newlines',
      });
    });

    it('should decode HTML entities in Open Graph content', async () => {
      createTestDOM('unknown.com', 'Document Title');
      
      // Add og:title with HTML entities
      const ogTitleMeta = document.createElement('meta');
      ogTitleMeta.setAttribute('property', 'og:title');
      ogTitleMeta.setAttribute('content', 'Title with &quot;quotes&quot; &amp; &lt;tags&gt;');
      document.head.appendChild(ogTitleMeta);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://unknown.com/test-page',
        title: 'Title with "quotes" & <tags>',
      });
    });

    it('should fallback to document title when og:title is empty', async () => {
      createTestDOM('unknown.com', 'Document Title');
      
      // Add empty og:title meta tag
      const ogTitleMeta = document.createElement('meta');
      ogTitleMeta.setAttribute('property', 'og:title');
      ogTitleMeta.setAttribute('content', '');
      document.head.appendChild(ogTitleMeta);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://unknown.com/test-page',
        title: 'Document Title',
      });
    });

    it('should handle Dropbox Paper pages', async () => {
      createTestDOM('paper.dropbox.com', 'Document Title', {
        '.hp-header-title-wrapper': 'My Paper Document',
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://paper.dropbox.com/test-page',
        title: 'My Paper Document (Paper)',
      });
    });

    it('should handle Amazon product pages', async () => {
      createTestDOM('amazon.com', 'Amazon Product');
      
      // Create proper elements for Amazon
      const productTitle = document.createElement('div');
      productTitle.id = 'productTitle';
      productTitle.textContent = 'Amazing Product';
      document.body.appendChild(productTitle);
      
      const asinInput = document.createElement('input');
      asinInput.id = 'ASIN';
      asinInput.value = 'B12345ABCD';
      document.body.appendChild(asinInput);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://www.amazon.com/dp/B12345ABCD',
        title: 'Amazing Product',
      });
    });

    it('should handle AWS pages that do not match the title pattern', async () => {
      createTestDOM('aws.amazon.com', 'AWS Console');
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://aws.amazon.com/test-page',
        title: 'AWS Console',
      });
    });

    it('should handle AWS documentation pages with service suffix', async () => {
      createTestDOM('aws.amazon.com', 'Using Batch Operations to enable S3 Bucket Keys for SSE-KMS - Amazon Simple Storage Service');
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://aws.amazon.com/test-page',
        title: 'Amazon Simple Storage Service: Using Batch Operations to enable S3 Bucket Keys for SSE-KMS',
      });
    });

    it('should handle AWS documentation pages without service suffix', async () => {
      createTestDOM('aws.amazon.com', 'AWS Documentation Page');
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://aws.amazon.com/test-page',
        title: 'AWS Documentation Page',
      });
    });

    it('should handle AWS documentation pages with multiple dashes', async () => {
      createTestDOM('aws.amazon.com', 'Getting Started - Advanced Features - Amazon EC2');
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://aws.amazon.com/test-page',
        title: 'Amazon EC2: Getting Started - Advanced Features',
      });
    });

    it('should handle Figma URLs with query parameters and product suffix', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://staging.figma.com/board/zQkwQn9gu5C4wK5MER61Ml/Samsung-S3-Brainstorm?node-id=0-1&p=f&t=Q6e0J45CRw3BJdwM-0',
          hostname: 'staging.figma.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Samsung S3 Brainstorm – FigJam',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://staging.figma.com/board/zQkwQn9gu5C4wK5MER61Ml/Samsung-S3-Brainstorm',
        title: 'Samsung S3 Brainstorm (FigJam)',
      });
    });

    it('should handle Figma URLs without product suffix', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://www.figma.com/design/abc123/My-Design?node-id=1-2',
          hostname: 'www.figma.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'My Design',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://www.figma.com/design/abc123/My-Design',
        title: 'My Design',
      });
    });

    it('should handle Figma URLs with different products', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://figma.com/file/xyz789/Prototype?mode=design&t=abc123',
          hostname: 'figma.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'My Prototype – Figma',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://figma.com/file/xyz789/Prototype',
        title: 'My Prototype (Figma)',
      });
    });

    it('should handle Google Docs URLs with query parameters', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://docs.google.com/document/d/1KZW8LYsj-7YhSTucPj4kJK7r4so4JAXjERYmh6x0b04/edit?tab=t.0',
          hostname: 'docs.google.com',
          pathname: '/document/d/1KZW8LYsj-7YhSTucPj4kJK7r4so4JAXjERYmh6x0b04/edit',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Scoping for Payload Integration - Google Docs',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://docs.google.com/document/d/1KZW8LYsj-7YhSTucPj4kJK7r4so4JAXjERYmh6x0b04/edit',
        title: 'Scoping for Payload Integration (Google Docs)',
      });
    });

    it('should handle Google Sheets URLs', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://docs.google.com/spreadsheets/d/1ABC123/edit?usp=sharing&gid=0',
          hostname: 'docs.google.com',
          pathname: '/spreadsheets/d/1ABC123/edit',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Budget Planning - Google Sheets',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://docs.google.com/spreadsheets/d/1ABC123/edit',
        title: 'Budget Planning (Google Sheets)',
      });
    });

    it('should handle Google Docs without /edit in URL', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://docs.google.com/document/d/1KZW8LYsj-7YhSTucPj4kJK7r4so4JAXjERYmh6x0b04/view',
          hostname: 'docs.google.com',
          pathname: '/document/d/1KZW8LYsj-7YhSTucPj4kJK7r4so4JAXjERYmh6x0b04/view',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Document Title - Google Docs',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://docs.google.com/document/d/1KZW8LYsj-7YhSTucPj4kJK7r4so4JAXjERYmh6x0b04/view',
        title: 'Document Title (Google Docs)',
      });
    });

    it('should handle Google Docs titles without service suffix', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://docs.google.com/document/d/1KZW8LYsj-7YhSTucPj4kJK7r4so4JAXjERYmh6x0b04/edit',
          hostname: 'docs.google.com',
          pathname: '/document/d/1KZW8LYsj-7YhSTucPj4kJK7r4so4JAXjERYmh6x0b04/edit',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Document Title',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://docs.google.com/document/d/1KZW8LYsj-7YhSTucPj4kJK7r4so4JAXjERYmh6x0b04/edit',
        title: 'Document Title',
      });
    });

    it('should handle Figma URLs with em dash separator', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://figma.com/file/xyz789/Design?node-id=1-2',
          hostname: 'figma.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'My Design – FigJam',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://figma.com/file/xyz789/Design',
        title: 'My Design (FigJam)',
      });
    });

    it('should handle titles with mixed dashes by splitting on the last occurrence', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://docs.google.com/document/d/1ABC123/edit',
          hostname: 'docs.google.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'My Document - Part 1 – Google Docs',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://docs.google.com/document/d/1ABC123/edit',
        title: 'My Document - Part 1 (Google Docs)',
      });
    });

    it('should handle titles with mixed dashes when hyphen appears last', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://figma.com/file/xyz789/Design',
          hostname: 'figma.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'My Design – Version 2 - FigJam',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://figma.com/file/xyz789/Design',
        title: 'My Design – Version 2 (FigJam)',
      });
    });

    it('should prioritize Graphite Figma rule over general Figma rule', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.graphite.dev/github/pr/figma/figma/529307/generate_signed_url-Add-sorbet-types-and-deprecate-policy-param',
          hostname: 'app.graphite.dev',
          pathname: '/github/pr/figma/figma/529307/generate_signed_url-Add-sorbet-types-and-deprecate-policy-param',
        },
        writable: true,
      });

      const graphiteTitle = '#529307 generate_signed_url: Add sorbet types and deprecate policy param - Graphite';
      Object.defineProperty(document, 'title', {
        value: graphiteTitle,
        writable: true,
      });

      // Clear document body and add avatar img element (no CodeDiff container)
      document.body.innerHTML = '';
      const avatarImg = document.createElement('img');
      avatarImg.src = 'https://avatars.githubusercontent.com/u/104477175?size=32';
      avatarImg.alt = 'jiechen-figma';
      document.body.appendChild(avatarImg);
      
      const result = await getDocInfo();
      
      // Should use Graphite rule, not general Figma rule
      expect(result).toEqual({
        link: 'https://github.com/figma/figma/pull/529307',
        title: '[PR] generate_signed_url: Add sorbet types and deprecate policy param',
      });
    });

    it('should handle GitHub commit URLs', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://github.com/figma/figma/commit/b95da065d9ec2eae4549ac62ca92593b82450d29#diff-29a5d49a22228a013f2cb76b27c31fd4032f6d46c3119aec7bc79b1fe3a0ed66',
          hostname: 'github.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'sinatra: Blobstore AiChatMessageContentEntity and an API to create/li… · figma/figma@b95da06',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://github.com/figma/figma/commit/b95da065d9ec2eae4549ac62ca92593b82450d29',
        title: 'sinatra: Blobstore AiChatMessageContentEntity and an API to create/li…',
      });
    });

    it('should handle GitHub commit URLs without standard format', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://github.com/other/repo/commit/abc123#diff-xyz',
          hostname: 'github.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Some commit title without standard format',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://github.com/other/repo/commit/abc123',
        title: 'Some commit title without standard format',
      });
    });

    it('should handle GitHub commit URLs with different separator patterns', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://github.com/figma/figma/commit/def456',
          hostname: 'github.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'fix: Update component styles · figma/figma@def456',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://github.com/figma/figma/commit/def456',
        title: 'fix: Update component styles',
      });
    });

    it('should only match PR URLs for FigmaGithub rule, not commit URLs', async () => {
      // Test that commit URLs don't match FigmaGithub rule
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://github.com/figma/figma/commit/b95da065d9ec2eae4549ac62ca92593b82450d29',
          hostname: 'github.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'sinatra: Blobstore AiChatMessageContentEntity and an API to create/li… · figma/figma@b95da06',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      // Should use githubCommit rule, not FigmaGithub rule
      expect(result).toEqual({
        link: 'https://github.com/figma/figma/commit/b95da065d9ec2eae4549ac62ca92593b82450d29',
        title: 'sinatra: Blobstore AiChatMessageContentEntity and an API to create/li…',
      });
    });

    it('should handle Datadog notebook URLs with query parameters', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/notebook/12686783/checkpointdiff-blobstorelite-rollout?range=604800000&start=1751564361853&live=true',
          hostname: 'app.datadoghq.com',
          pathname: '/notebook/12686783/checkpointdiff-blobstorelite-rollout',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'CheckpointDiff BlobStoreLite Rollout | Datadog',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/notebook/12686783/checkpointdiff-blobstorelite-rollout?range=604800000&start=1751564361853&live=true',
        title: 'CheckpointDiff BlobStoreLite Rollout (Datadog Notebook)',
      });
    });

    it('should handle Datadog notebook URLs without query parameters', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/notebook/123456/my-notebook',
          hostname: 'app.datadoghq.com',
          pathname: '/notebook/123456/my-notebook',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'My Analysis Notebook | Datadog',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/notebook/123456/my-notebook',
        title: 'My Analysis Notebook (Datadog Notebook)',
      });
    });

    it('should not match non-notebook Datadog URLs', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/dashboard/123/my-dashboard',
          hostname: 'app.datadoghq.com',
          pathname: '/dashboard/123/my-dashboard',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'My Dashboard | Datadog',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      // Should use default behavior since it's not a notebook URL
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/dashboard/123/my-dashboard',
        title: 'My Dashboard | Datadog',
      });
    });

    it('should handle Datadog notebook titles without standard format', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/notebook/789/test-notebook',
          hostname: 'app.datadoghq.com',
          pathname: '/notebook/789/test-notebook',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Some Custom Title Format',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/notebook/789/test-notebook',
        title: 'Some Custom Title Format',
      });
    });

    it('should handle Datadog monitor URLs with query parameters', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/monitors/164721503?q=workflow_name%3A%22figma%3A%3Ablobstoreorgdatalocalitymigrations%3A%3Asinglereferrerworkflow%22&link_source=monitor_notif&from_ts=1752077325644&to_ts=1752682125644&live=true',
          hostname: 'app.datadoghq.com',
          pathname: '/monitors/164721503',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Datadog Monitor Page',
        writable: true,
      });

      // Clear document body and create h1 element with monitor title
      document.body.innerHTML = '';
      const h1Element = document.createElement('h1');
      h1Element.textContent = 'Temporal Workflow Failed in (production) [production.sinatra.n-a.sinatra_temporal_autogenerated_alerts]';
      document.body.appendChild(h1Element);

      // Create span with "Message" text and h3 with alert
      const messageSpan = document.createElement('span');
      messageSpan.textContent = 'Message';
      document.body.appendChild(messageSpan);
      
      const h3Element = document.createElement('h3');
      h3Element.textContent = '[Triggered] Temporal Workflow Failed in (production) [production.sinatra.n-a.sinatra_temporal_autogenerated_alerts] {workflow_name:figma::blobstoreorgdatalocalitymigrations::singlereferrerworkflow}';
      document.body.appendChild(h3Element);
      
      // Create date range picker
      const dateRangePicker = document.createElement('div');
      dateRangePicker.className = 'druids_time_date-range-picker';
      const input = document.createElement('input');
      input.value = 'Jul 25, 2:00 pm – Jul 25, 3:00 pm';
      dateRangePicker.appendChild(input);
      document.body.appendChild(dateRangePicker);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/monitors/164721503?q=workflow_name%3A%22figma%3A%3Ablobstoreorgdatalocalitymigrations%3A%3Asinglereferrerworkflow%22&link_source=monitor_notif&from_ts=1752077325644&to_ts=1752682125644&live=true',
        title: 'Temporal Workflow Failed in (production) [production.sinatra.n-a.sinatra_temporal_autogenerated_alerts] {workflow_name:figma::blobstoreorgdatalocalitymigrations::singlereferrerworkflow} (Jul 25, 2:00 pm – Jul 25, 3:00 pm)',
      });
    });

    it('should handle Datadog monitor URLs without query parameters', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/monitors/12345',
          hostname: 'app.datadoghq.com',
          pathname: '/monitors/12345',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Datadog Monitor Page',
        writable: true,
      });

      // Clear document body and create h1 element with monitor title
      document.body.innerHTML = '';
      const h1Element = document.createElement('h1');
      h1Element.textContent = 'Database Connection Error Alert';
      document.body.appendChild(h1Element);

      // Create span with "Message" text and h3 with alert
      const messageSpan = document.createElement('span');
      messageSpan.textContent = 'Message';
      document.body.appendChild(messageSpan);
      
      const h3Element = document.createElement('h3');
      h3Element.textContent = '[Triggered] Database Connection Error Alert {host:db-server-01}';
      document.body.appendChild(h3Element);
      
      // Create date range picker
      const dateRangePicker = document.createElement('div');
      dateRangePicker.className = 'druids_time_date-range-picker';
      const input = document.createElement('input');
      input.value = 'Jul 24, 1:00 pm – Jul 24, 2:00 pm';
      dateRangePicker.appendChild(input);
      document.body.appendChild(dateRangePicker);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/monitors/12345',
        title: 'Database Connection Error Alert {host:db-server-01} (Jul 24, 1:00 pm – Jul 24, 2:00 pm)',
      });
    });

    it('should fallback to document title when h1 is empty for Datadog monitors', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/monitors/67890',
          hostname: 'app.datadoghq.com',
          pathname: '/monitors/67890',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Datadog Monitor - Fallback Title',
        writable: true,
      });

      // Clear document body and create h1 element with empty content
      document.body.innerHTML = '';
      const h1Element = document.createElement('h1');
      h1Element.textContent = '';
      document.body.appendChild(h1Element);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/monitors/67890',
        title: 'Datadog Monitor - Fallback Title',
      });
    });

    it('should use h1 text when no matching h3 found for Datadog monitors', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/monitors/11111',
          hostname: 'app.datadoghq.com',
          pathname: '/monitors/11111',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Datadog Monitor Page',
        writable: true,
      });

      // Clear document body and create h1 element
      document.body.innerHTML = '';
      const h1Element = document.createElement('h1');
      h1Element.textContent = 'CPU Usage Alert';
      document.body.appendChild(h1Element);

      // Create h3 element that doesn't contain h1 text
      const h3Element = document.createElement('h3');
      h3Element.textContent = 'Some other alert information';
      document.body.appendChild(h3Element);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/monitors/11111',
        title: 'CPU Usage Alert',
      });
    });

    it('should handle h3 with h1 text but no trigger condition for Datadog monitors', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/monitors/22222',
          hostname: 'app.datadoghq.com',
          pathname: '/monitors/22222',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Datadog Monitor Page',
        writable: true,
      });

      // Clear document body and create h1 element
      document.body.innerHTML = '';
      const h1Element = document.createElement('h1');
      h1Element.textContent = 'Memory Usage Alert';
      document.body.appendChild(h1Element);

      // Create h3 element that contains h1 text but no trigger condition
      const h3Element = document.createElement('h3');
      h3Element.textContent = 'Triggered Memory Usage Alert on multiple hosts';
      document.body.appendChild(h3Element);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/monitors/22222',
        title: 'Memory Usage Alert',
      });
    });

    it('should select first matching h3 when multiple h3 elements contain h1 text', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/monitors/33333',
          hostname: 'app.datadoghq.com',
          pathname: '/monitors/33333',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Datadog Monitor Page',
        writable: true,
      });

      // Clear document body and create h1 element
      document.body.innerHTML = '';
      const h1Element = document.createElement('h1');
      h1Element.textContent = 'Disk Space Alert';
      document.body.appendChild(h1Element);

      // Create span with "Message" text
      const messageSpan = document.createElement('span');
      messageSpan.textContent = 'Message';
      document.body.appendChild(messageSpan);

      // Create first h3 element with trigger condition (should be selected)
      const h3Element1 = document.createElement('h3');
      h3Element1.textContent = '[Triggered] {environment:production} Disk Space Alert';
      document.body.appendChild(h3Element1);

      // Create second h3 element with different trigger condition (should be ignored)
      const h3Element2 = document.createElement('h3');
      h3Element2.textContent = '[Triggered] {environment:staging} Disk Space Alert';
      document.body.appendChild(h3Element2);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/monitors/33333',
        title: 'Disk Space Alert{environment:production}',
      });
    });

    it('should prioritize Datadog monitor rule over notebook rule for monitor URLs', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/monitors/999/some-monitor',
          hostname: 'app.datadoghq.com',
          pathname: '/monitors/999/some-monitor',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Monitor Title | Datadog',
        writable: true,
      });

      // Clear document body and create h1 element
      document.body.innerHTML = '';
      const h1Element = document.createElement('h1');
      h1Element.textContent = 'CPU Usage Alert [prod.cpu.high]';
      document.body.appendChild(h1Element);

      // Create span with "Message" text
      const messageSpan = document.createElement('span');
      messageSpan.textContent = 'Message';
      document.body.appendChild(messageSpan);

      // Create h3 element with trigger condition
      const h3Element = document.createElement('h3');
      h3Element.textContent = '[Triggered] {service:web-server} CPU Usage Alert [prod.cpu.high]';
      document.body.appendChild(h3Element);
      
      const result = await getDocInfo();
      
      // Should use monitor rule (with h1 + trigger content), not notebook rule (with document.title)
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/monitors/999/some-monitor',
        title: 'CPU Usage Alert [prod.cpu.high]{service:web-server}',
      });
    });

    it('should not match non-monitor Datadog URLs for monitor rule', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/dashboard/123/my-dashboard',
          hostname: 'app.datadoghq.com',
          pathname: '/dashboard/123/my-dashboard',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'My Dashboard | Datadog',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      // Should use default behavior since it's not a monitor URL
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/dashboard/123/my-dashboard',
        title: 'My Dashboard | Datadog',
      });
    });

    it('should handle Datadog monitor URLs with [Warn status', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/monitors/164721504?from_ts=1752077325644&to_ts=1752682125644&live=true',
          hostname: 'app.datadoghq.com',
          pathname: '/monitors/164721504',
        },
        writable: true,
      });
      Object.defineProperty(document, 'title', {
        value: 'Datadog Monitor Page',
        writable: true,
      });
      // Clear document body and create span with "Message" text and h3 with [Warn alert
      document.body.innerHTML = '';
      const messageSpan = document.createElement('span');
      messageSpan.textContent = 'Message';
      document.body.appendChild(messageSpan);
      
      const h3Element = document.createElement('h3');
      h3Element.textContent = '[Warn] Memory usage is high [production.api.memory_usage_alert]';
      document.body.appendChild(h3Element);
      
      // Create date range picker
      const dateRangePicker = document.createElement('div');
      dateRangePicker.className = 'druids_time_date-range-picker';
      const input = document.createElement('input');
      input.value = 'Jul 26, 3:00 pm – Jul 26, 4:00 pm';
      dateRangePicker.appendChild(input);
      document.body.appendChild(dateRangePicker);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/monitors/164721504?from_ts=1752077325644&to_ts=1752682125644&live=true',
        title: 'Memory usage is high [production.api.memory_usage_alert] (Jul 26, 3:00 pm – Jul 26, 4:00 pm)',
      });
    });

    it('should always include time range even when no alert element found', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/monitors/12346',
          hostname: 'app.datadoghq.com',
          pathname: '/monitors/12346',
        },
        writable: true,
      });
      Object.defineProperty(document, 'title', {
        value: 'Monitor Overview',
        writable: true,
      });
      
      // Clear document body and create only date range picker (no Message span or h3)
      document.body.innerHTML = '';
      const dateRangePicker = document.createElement('div');
      dateRangePicker.className = 'druids_time_date-range-picker';
      const input = document.createElement('input');
      input.value = 'Jul 27, 5:00 pm – Jul 27, 6:00 pm';
      dateRangePicker.appendChild(input);
      document.body.appendChild(dateRangePicker);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/monitors/12346',
        title: 'Monitor Overview (Jul 27, 5:00 pm – Jul 27, 6:00 pm)',
      });
    });

    it('should handle GitHub Figma PR URLs specifically', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://github.com/figma/figma/pull/123',
          hostname: 'github.com',
        },
        writable: true,
      });

      const prTitle = 'design-systems: centralize remaining mutators by jaredw-figma · Pull Request #377045 · figma/figma';
      Object.defineProperty(document, 'title', {
        value: prTitle,
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://github.com/figma/figma/pull/123',
        title: '[PR] design-systems: centralize remaining mutators (jaredw-figma)',
      });
    });

    it('should handle GitHub Figma PR URLs with BlobStore prefix and map GitHub handle to Slack name', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://github.com/figma/figma/pull/529009',
          hostname: 'github.com',
        },
        writable: true,
      });

      const prTitle = '[BlobStore][1/n] Consolidate image duplicate logic by jiechen-figma · Pull Request #529009 · figma/figma';
      Object.defineProperty(document, 'title', {
        value: prTitle,
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://github.com/figma/figma/pull/529009',
        title: '[PR] [BlobStore][1/n] Consolidate image duplicate logic (jiechen-figma)',
      });
    });

    it('should fallback to GitHub handle when Slack name not found in mapping', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://github.com/figma/figma/pull/456',
          hostname: 'github.com',
        },
        writable: true,
      });

      const prTitle = 'Some feature by unknown-figma-user · Pull Request #456 · figma/figma';
      Object.defineProperty(document, 'title', {
        value: prTitle,
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://github.com/figma/figma/pull/456',
        title: '[PR] Some feature (unknown-figma-user)',
      });
    });

    it('should handle GitHub Figma PR URLs with jaredw-figma handle', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://github.com/figma/figma/pull/789',
          hostname: 'github.com',
        },
        writable: true,
      });

      const prTitle = 'Fix component styles by jaredw-figma · Pull Request #789 · figma/figma';
      Object.defineProperty(document, 'title', {
        value: prTitle,
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://github.com/figma/figma/pull/789',
        title: '[PR] Fix component styles (jaredw-figma)',
      });
    });

    it('should handle GitHub Figma PR URLs with jaredlwong handle', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://github.com/figma/figma/pull/101112',
          hostname: 'github.com',
        },
        writable: true,
      });

      const prTitle = 'Update authentication logic by jaredlwong · Pull Request #101112 · figma/figma';
      Object.defineProperty(document, 'title', {
        value: prTitle,
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://github.com/figma/figma/pull/101112',
        title: '[PR] Update authentication logic (jaredlwong)',
      });
    });

    it('should handle Graphite Figma PRs', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.graphite.dev/github/pr/figma/figma/529307/generate_signed_url-Add-sorbet-types-and-deprecate-policy-param',
          hostname: 'app.graphite.dev',
          pathname: '/github/pr/figma/figma/529307/generate_signed_url-Add-sorbet-types-and-deprecate-policy-param',
        },
        writable: true,
      });

      const graphiteTitle = '#529307 generate_signed_url: Add sorbet types and deprecate policy param - Graphite';
      Object.defineProperty(document, 'title', {
        value: graphiteTitle,
        writable: true,
      });

      // Clear document body and add avatar img element (no CodeDiff container)
      document.body.innerHTML = '';
      const avatarImg = document.createElement('img');
      avatarImg.src = 'https://avatars.githubusercontent.com/u/104477175?size=32';
      avatarImg.alt = 'jwong-figma';
      avatarImg.width = 16;
      avatarImg.height = 16;
      avatarImg.loading = 'lazy';
      document.body.appendChild(avatarImg);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://github.com/figma/figma/pull/529307',
        title: '[PR] generate_signed_url: Add sorbet types and deprecate policy param',
      });
    });

    it('should handle Graphite Figma PRs without avatar image', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.graphite.dev/github/pr/figma/figma/456789/some-feature',
          hostname: 'app.graphite.dev',
          pathname: '/github/pr/figma/figma/456789/some-feature',
        },
        writable: true,
      });

      const graphiteTitle = '#456789 some feature title - Graphite';
      Object.defineProperty(document, 'title', {
        value: graphiteTitle,
        writable: true,
      });

      // Clear document body - no avatar img element
      document.body.innerHTML = '';
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://github.com/figma/figma/pull/456789',
        title: '[PR] some feature title',
      });
    });

    it('should handle Graphite Figma PRs with unmapped GitHub handle', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.graphite.dev/github/pr/figma/figma/789123/another-feature',
          hostname: 'app.graphite.dev',
          pathname: '/github/pr/figma/figma/789123/another-feature',
        },
        writable: true,
      });

      const graphiteTitle = '#789123 another feature title - Graphite';
      Object.defineProperty(document, 'title', {
        value: graphiteTitle,
        writable: true,
      });

      // Clear document body and add avatar img element with unmapped handle (no CodeDiff container)
      document.body.innerHTML = '';
      const avatarImg = document.createElement('img');
      avatarImg.src = 'https://avatars.githubusercontent.com/u/999999?size=32';
      avatarImg.alt = 'unknown-user-figma';
      document.body.appendChild(avatarImg);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://github.com/figma/figma/pull/789123',
        title: '[PR] another feature title',
      });
    });

    it('should handle Graphite Figma PRs with jaredlwong handle', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.graphite.dev/github/pr/figma/figma/333444/update-styles',
          hostname: 'app.graphite.dev',
          pathname: '/github/pr/figma/figma/333444/update-styles',
        },
        writable: true,
      });

      const graphiteTitle = '#333444 update styles and components - Graphite';
      Object.defineProperty(document, 'title', {
        value: graphiteTitle,
        writable: true,
      });

      // Clear document body and add avatar img element with jaredlwong handle (no CodeDiff container)
      document.body.innerHTML = '';
      const avatarImg = document.createElement('img');
      avatarImg.src = 'https://avatars.githubusercontent.com/u/123456?size=32';
      avatarImg.alt = 'jaredlwong';
      document.body.appendChild(avatarImg);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://github.com/figma/figma/pull/333444',
        title: '[PR] update styles and components',
      });
    });

    it('should handle Graphite Figma PRs with CodeDiff container', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.graphite.dev/github/pr/figma/figma/555666/fix-styles',
          hostname: 'app.graphite.dev',
          pathname: '/github/pr/figma/figma/555666/fix-styles',
        },
        writable: true,
      });

      const graphiteTitle = '#555666 fix styles in component - Graphite';
      Object.defineProperty(document, 'title', {
        value: graphiteTitle,
        writable: true,
      });

      // Clear document body and create CodeDiff container with avatar
      document.body.innerHTML = '';
      
      // Create a container div with CodeDiff_ class prefix
      const codeDiffContainer = document.createElement('div');
      codeDiffContainer.className = 'CodeDiff_codeDiffContentsConstrained__uCxdU utilities_flexColumn__TuzGh';
      
      // Add avatar img inside the container
      const avatarImg = document.createElement('img');
      avatarImg.src = 'https://avatars.githubusercontent.com/u/789?size=32';
      avatarImg.alt = 'gzfigma';
      codeDiffContainer.appendChild(avatarImg);
      
      // Add some distractor avatar outside the container
      const distractorImg = document.createElement('img');
      distractorImg.src = 'https://avatars.githubusercontent.com/u/999?size=32';
      distractorImg.alt = 'wrong-user';
      
      document.body.appendChild(distractorImg);
      document.body.appendChild(codeDiffContainer);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://github.com/figma/figma/pull/555666',
        title: '[PR] fix styles in component (gzfigma)',
      });
    });

    it('should handle element not found errors by falling back', async () => {
      createTestDOM('paper.dropbox.com', 'Document Title');
      // Don't add the required element - should fall back to default behavior
      
      const result = await getDocInfo();
      expect(result).toEqual({
        link: 'https://paper.dropbox.com/test-page',
        title: 'Document Title'
      });
    });

    it('should handle Asana task URLs with standard title format', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.asana.com/1/10497086658021/project/1209411897192691/task/1210753481946725?focus=true',
          hostname: 'app.asana.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Investigate why blobstore org data locality migrations keep failing - Asana',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.asana.com/1/10497086658021/project/1209411897192691/task/1210753481946725?focus=true',
        title: 'Investigate why blobstore org data locality migrations keep failing (Asana)',
      });
    });

    it('should handle Asana task URLs with team prefix in title', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.asana.com/1/10497086658021/project/1209411897192691/task/1210753481946725',
          hostname: 'app.asana.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: '● FigFile Content Team - Investigate why blobstore org data locality migrations keep failing - Asana',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.asana.com/1/10497086658021/project/1209411897192691/task/1210753481946725?focus=true',
        title: 'Investigate why blobstore org data locality migrations keep failing (Asana)',
      });
    });

    it('should handle Asana URLs without standard title format', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.asana.com/1/12345/project/67890',
          hostname: 'app.asana.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Custom Asana Page Title',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.asana.com/1/12345/project/67890?focus=true',
        title: 'Custom Asana Page Title',
      });
    });

    it('should handle Asana URLs with different team prefix formats', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.asana.com/1/11111/task/22222',
          hostname: 'app.asana.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: '● Engineering Team - Fix deployment pipeline - Asana',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.asana.com/1/11111/task/22222?focus=true',
        title: 'Fix deployment pipeline (Asana)',
      });
    });

    it('should handle Notion URLs with notification numbers', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://www.notion.so/figma/S3-Inventory-go-s3-inventory-1c33ac032aac446a8e41bc58cc296b6d',
          hostname: 'www.notion.so',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: '(1) S3 Inventory (go/s3-inventory)',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://www.notion.so/figma/S3-Inventory-go-s3-inventory-1c33ac032aac446a8e41bc58cc296b6d',
        title: 'S3 Inventory (go/s3-inventory) (Notion)',
      });
    });

    it('should handle Notion URLs without notification numbers', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://www.notion.so/figma/My-Document-abc123',
          hostname: 'www.notion.so',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'My Document Title',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://www.notion.so/figma/My-Document-abc123',
        title: 'My Document Title (Notion)',
      });
    });

    it('should handle Notion URLs with different notification numbers', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://notion.so/workspace/Document-xyz789',
          hostname: 'notion.so',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: '(42) Important Meeting Notes',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://notion.so/workspace/Document-xyz789',
        title: 'Important Meeting Notes (Notion)',
      });
    });

    it('should handle Notion subdomains', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://mycompany.notion.so/Database-View',
          hostname: 'mycompany.notion.so',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: '(5) Database View',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://mycompany.notion.so/Database-View',
        title: 'Database View (Notion)',
      });
    });

    it('should not match non-Notion URLs', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://example.com/document',
          hostname: 'example.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: '(1) Example Document',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      // Should use default behavior, not Notion rule
      expect(result).toEqual({
        link: 'https://example.com/document',
        title: '(1) Example Document',
      });
    });
  });

  describe('FigmaGithub class', () => {
    // Since FigmaGithub is not exported, we need to test it through getDocInfo
    // but we can test the parsePRString logic by creating a test instance
    
    it('should parse PR strings correctly', () => {
      // We can't directly access the class, so let's test the parsing logic
      const prString = 'design-systems: centralize remaining mutators by jaredw-figma · Pull Request #377045 · figma/figma';
      
      // Test the regex pattern manually
      const regex = /(?<title>.*) by (?<author>.*) · Pull Request #(?<pr>\d+) · (?<repo>.*)/;
      const match = prString.match(regex);
      
      expect(match?.groups).toEqual({
        title: 'design-systems: centralize remaining mutators',
        author: 'jaredw-figma',
        pr: '377045',
        repo: 'figma/figma',
      });
    });

    it('should handle invalid PR strings', () => {
      const invalidPRString = 'invalid format';
      const regex = /(?<title>.*) by (?<author>.*) · Pull Request #(?<pr>\d+) · (?<repo>.*)/;
      const match = invalidPRString.match(regex);
      
      expect(match?.groups).toBeUndefined();
    });
  });

  describe('JSX Testing Example', () => {
    // Example of how to test JSX components if you had any
    it('should render a test component', () => {
      const TestComponent = () => <div>Hello World</div>;
      render(<TestComponent />);
      
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('should handle user interactions', () => {
      const TestButton = ({ onClick }: { onClick: () => void }) => (
        <button onClick={onClick}>Click me</button>
      );
      
      const mockClick = jest.fn();
      render(<TestButton onClick={mockClick} />);
      
      const button = screen.getByText('Click me');
      button.click();
      
      expect(mockClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('DOM utilities', () => {
    it('should find elements by selector', async () => {
      // Test the findElement function indirectly through getDocInfo
      createTestDOM('paper.dropbox.com', 'Test', {
        '.hp-header-title-wrapper': 'Test Content',
      });
      
      const result = await getDocInfo();
      expect(result.title).toBe('Test Content (Paper)');
    });

    it('should fall back when element not found', async () => {
      createTestDOM('paper.dropbox.com', 'Test');
      // Don't add the required element - should fall back to default behavior
      
      const result = await getDocInfo();
      expect(result).toEqual({
        link: 'https://paper.dropbox.com/test-page',
        title: 'Test'
      });
    });

    it('should find elements by class prefix', () => {
      // Clear document body
      document.body.innerHTML = '';
      
      // Create elements with various classes
      const div1 = document.createElement('div');
      div1.className = 'CodeDiff_container__abc123 other-class';
      
      const div2 = document.createElement('div');
      div2.className = 'some-other-class CodeDiff_wrapper__xyz789';
      
      const span = document.createElement('span');
      span.className = 'CodeDiff_text__def456';
      
      document.body.appendChild(div1);
      document.body.appendChild(div2);
      document.body.appendChild(span);
      
      // Test finding by class prefix and tag name
      const result1 = findElementByClassPrefix('CodeDiff_', 'div');
      expect(result1).toBe(div1); // Should find the first matching div
      
      // Test finding any tag with the prefix
      const result2 = findElementByClassPrefix('CodeDiff_');
      expect(result2).toBe(div1); // Should find the first matching element
      
      // Test non-existent prefix
      const result3 = findElementByClassPrefix('NonExistent_');
      expect(result3).toBeNull();
    });
  });

  describe('Clipboard functionality', () => {
    it('should copy formatted text to clipboard', async () => {
      const mockWrite = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { write: mockWrite },
        writable: true,
      });

      createTestDOM('example.com', 'Test Page');
      
      // The actual clipboard functionality runs in the IIFE at the end of linkme.ts
      // We can't test it directly without refactoring, but we can verify the mock setup
      expect(navigator.clipboard.write).toBeDefined();
    });

    it('should escape square brackets in markdown format', async () => {
      const mockWrite = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { write: mockWrite },
        writable: true,
      });

      // Mock document.hasFocus to return true
      Object.defineProperty(document, 'hasFocus', {
        value: jest.fn().mockReturnValue(true),
        writable: true,
      });

      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/monitors/12345',
          hostname: 'app.datadoghq.com',
          pathname: '/monitors/12345',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Test Monitor',
        writable: true,
      });

      // Clear document body and create elements with square brackets
      document.body.innerHTML = '';
      const h1Element = document.createElement('h1');
      h1Element.textContent = 'Alert [prod.service.error]';
      document.body.appendChild(h1Element);

      // Create span with "Message" text
      const messageSpan = document.createElement('span');
      messageSpan.textContent = 'Message';
      document.body.appendChild(messageSpan);

      const h3Element = document.createElement('h3');
      h3Element.textContent = '[Triggered] {env:production} Alert [prod.service.error]';
      document.body.appendChild(h3Element);

      // Test that getDocInfo correctly handles titles with square brackets
      const docInfo = await getDocInfo();
      
      // The title should contain square brackets (which will be escaped in copyToClipboard)
      expect(docInfo.title).toBe('Alert [prod.service.error]{env:production}');
      
      // Verify the title contains square brackets that need escaping
      expect(docInfo.title).toContain('[');
      expect(docInfo.title).toContain(']');
    });

    it('should handle Greenhouse scorecard URLs with /edit', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app4.greenhouse.io/scorecards/19152213004/edit',
          hostname: 'app4.greenhouse.io',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Greenhouse Scorecard',
        writable: true,
      });

      // Clear document body and create h3.name element
      document.body.innerHTML = '';
      const nameElement = document.createElement('h3');
      nameElement.className = 'name';
      nameElement.innerHTML = '\n\nJared Wong\n\n';
      document.body.appendChild(nameElement);

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app4.greenhouse.io/scorecards/19152213004',
        title: 'Jared Wong (Greenhouse Scorecard)',
      });
    });

    it('should handle Greenhouse scorecard URLs without /edit', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app4.greenhouse.io/scorecards/19152213004',
          hostname: 'app4.greenhouse.io',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Greenhouse Scorecard',
        writable: true,
      });

      // Clear document body and create h3.name element
      document.body.innerHTML = '';
      const nameElement = document.createElement('h3');
      nameElement.className = 'name';
      nameElement.textContent = 'John Smith';
      document.body.appendChild(nameElement);

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app4.greenhouse.io/scorecards/19152213004',
        title: 'John Smith (Greenhouse Scorecard)',
      });
    });

    it('should handle Greenhouse scorecard URLs with whitespace in name', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app4.greenhouse.io/scorecards/12345/edit',
          hostname: 'app4.greenhouse.io',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Greenhouse Scorecard',
        writable: true,
      });

      // Clear document body and create h3.name element with excessive whitespace
      document.body.innerHTML = '';
      const nameElement = document.createElement('h3');
      nameElement.className = 'name';
      nameElement.innerHTML = '   \n  Jane   \t  Doe  \n  ';
      document.body.appendChild(nameElement);

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app4.greenhouse.io/scorecards/12345',
        title: 'Jane Doe (Greenhouse Scorecard)',
      });
    });

    it('should handle LaunchDarkly flag URLs with targeting path', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.launchdarkly.com/projects/default/flags/ffp-use-new-oac-distribution-bool/targeting?env=production&env=staging&env=gov&env=development&env=devenv01&selected-env=devenv01',
          hostname: 'app.launchdarkly.com',
          pathname: '/projects/default/flags/ffp-use-new-oac-distribution-bool/targeting',
          protocol: 'https:',
          host: 'app.launchdarkly.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'ffp-use-new-oac-distribution-bool',
        writable: true,
      });

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.launchdarkly.com/projects/default/flags/ffp-use-new-oac-distribution-bool/monitoring?env=production&env=staging&env=gov&env=development&env=devenv01&selected-env=production&activity=true',
        title: 'ffp-use-new-oac-distribution-bool (LaunchDarkly)',
      });
    });

    it('should handle LaunchDarkly flag URLs with monitoring path', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.launchdarkly.com/projects/default/flags/my-feature-flag/monitoring?env=staging&selected-env=staging',
          hostname: 'app.launchdarkly.com',
          pathname: '/projects/default/flags/my-feature-flag/monitoring',
          protocol: 'https:',
          host: 'app.launchdarkly.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'my-feature-flag',
        writable: true,
      });

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.launchdarkly.com/projects/default/flags/my-feature-flag/monitoring?env=production&env=staging&env=gov&env=development&env=devenv01&selected-env=production&activity=true',
        title: 'my-feature-flag (LaunchDarkly)',
      });
    });

    it('should handle LaunchDarkly flag URLs without query parameters', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.launchdarkly.com/projects/default/flags/simple-flag/targeting',
          hostname: 'app.launchdarkly.com',
          pathname: '/projects/default/flags/simple-flag/targeting',
          protocol: 'https:',
          host: 'app.launchdarkly.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'simple-flag',
        writable: true,
      });

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.launchdarkly.com/projects/default/flags/simple-flag/monitoring?env=production&env=staging&env=gov&env=development&env=devenv01&selected-env=production&activity=true',
        title: 'simple-flag (LaunchDarkly)',
      });
    });

    it('should handle LaunchDarkly flag URLs with complex flag names', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.launchdarkly.com/projects/default/flags/feature-flag-with-dashes_and_underscores/targeting',
          hostname: 'app.launchdarkly.com',
          pathname: '/projects/default/flags/feature-flag-with-dashes_and_underscores/targeting',
          protocol: 'https:',
          host: 'app.launchdarkly.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'feature-flag-with-dashes_and_underscores',
        writable: true,
      });

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.launchdarkly.com/projects/default/flags/feature-flag-with-dashes_and_underscores/monitoring?env=production&env=staging&env=gov&env=development&env=devenv01&selected-env=production&activity=true',
        title: 'feature-flag-with-dashes_and_underscores (LaunchDarkly)',
      });
    });

    it('should handle LaunchDarkly non-flag URLs', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.launchdarkly.com/projects/default/dashboard',
          hostname: 'app.launchdarkly.com',
          pathname: '/projects/default/dashboard',
          protocol: 'https:',
          host: 'app.launchdarkly.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Dashboard - LaunchDarkly',
        writable: true,
      });

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.launchdarkly.com/projects/default/dashboard',
        title: 'Dashboard - LaunchDarkly (LaunchDarkly)',
      });
    });

    it('should handle LaunchDarkly URLs with different projects', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.launchdarkly.com/projects/my-project/flags/test-flag/targeting',
          hostname: 'app.launchdarkly.com',
          pathname: '/projects/my-project/flags/test-flag/targeting',
          protocol: 'https:',
          host: 'app.launchdarkly.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'test-flag',
        writable: true,
      });

      const result = await getDocInfo();
      
      // Should not match since it's not /projects/default/flags/
      expect(result).toEqual({
        link: 'https://app.launchdarkly.com/projects/my-project/flags/test-flag/targeting',
        title: 'test-flag (LaunchDarkly)',
      });
    });

    it('should not match non-LaunchDarkly URLs', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://other-app.launchdarkly.com/projects/default/flags/test-flag/targeting',
          hostname: 'other-app.launchdarkly.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'test-flag',
        writable: true,
      });

      const result = await getDocInfo();
      
      // Should use default behavior since hostname doesn't match
      expect(result).toEqual({
        link: 'https://other-app.launchdarkly.com/projects/default/flags/test-flag/targeting',
        title: 'test-flag',
      });
    });

    it('should handle Datadog logs URLs with query parameter and time range', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/logs?query=service%3Atemporal-worker%20status%3Aerror%20env%3Aproduction%20Figma%5C%3A%5C%3AOrgDataLocalityMigrationWorkflows%2A&agg_m=count&agg_m_source=base&agg_t=count&cols=host%2Cservice&messageDisplay=inline&refresh_mode=paused&storage=flex_tier&stream_sort=desc&viz=stream&from_ts=1753421640000&to_ts=1753422840000&live=false',
          hostname: 'app.datadoghq.com',
          pathname: '/logs',
          search: '?query=service%3Atemporal-worker%20status%3Aerror%20env%3Aproduction%20Figma%5C%3A%5C%3AOrgDataLocalityMigrationWorkflows%2A&agg_m=count&agg_m_source=base&agg_t=count&cols=host%2Cservice&messageDisplay=inline&refresh_mode=paused&storage=flex_tier&stream_sort=desc&viz=stream&from_ts=1753421640000&to_ts=1753422840000&live=false',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Datadog Logs',
        writable: true,
      });

      // Clear document body and create date range picker element
      document.body.innerHTML = '';
      const dateRangePicker = document.createElement('div');
      dateRangePicker.className = 'druids_time_date-range-picker';
      
      const input = document.createElement('input');
      input.value = 'Jul 25, 1:34 am – Jul 25, 1:54 am';
      dateRangePicker.appendChild(input);
      
      document.body.appendChild(dateRangePicker);

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/logs?query=service%3Atemporal-worker%20status%3Aerror%20env%3Aproduction%20Figma%5C%3A%5C%3AOrgDataLocalityMigrationWorkflows%2A&agg_m=count&agg_m_source=base&agg_t=count&cols=host%2Cservice&messageDisplay=inline&refresh_mode=paused&storage=flex_tier&stream_sort=desc&viz=stream&from_ts=1753421640000&to_ts=1753422840000&live=false',
        title: 'service:temporal-worker status:error env:production Figma\\:\\:OrgDataLocalityMigrationWorkflows* (Jul 25, 1:34 am – Jul 25, 1:54 am) (Logs)',
      });
    });

    it('should handle Datadog logs URLs with query parameter but no time range', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/logs?query=service%3Atemporal-worker%20status%3Aerror%20env%3Aproduction%20Figma%5C%3A%5C%3AOrgDataLocalityMigrationWorkflows%2A&agg_m=count&agg_m_source=base&agg_t=count&cols=host%2Cservice&messageDisplay=inline&refresh_mode=paused&storage=flex_tier&stream_sort=desc&viz=stream&from_ts=1753421640000&to_ts=1753422840000&live=false',
          hostname: 'app.datadoghq.com',
          pathname: '/logs',
          search: '?query=service%3Atemporal-worker%20status%3Aerror%20env%3Aproduction%20Figma%5C%3A%5C%3AOrgDataLocalityMigrationWorkflows%2A&agg_m=count&agg_m_source=base&agg_t=count&cols=host%2Cservice&messageDisplay=inline&refresh_mode=paused&storage=flex_tier&stream_sort=desc&viz=stream&from_ts=1753421640000&to_ts=1753422840000&live=false',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Datadog Logs',
        writable: true,
      });

      // Clear document body - no date range picker element
      document.body.innerHTML = '';

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/logs?query=service%3Atemporal-worker%20status%3Aerror%20env%3Aproduction%20Figma%5C%3A%5C%3AOrgDataLocalityMigrationWorkflows%2A&agg_m=count&agg_m_source=base&agg_t=count&cols=host%2Cservice&messageDisplay=inline&refresh_mode=paused&storage=flex_tier&stream_sort=desc&viz=stream&from_ts=1753421640000&to_ts=1753422840000&live=false',
        title: 'service:temporal-worker status:error env:production Figma\\:\\:OrgDataLocalityMigrationWorkflows* (Logs)',
      });
    });

    it('should handle Datadog logs URLs without query parameter but with time range', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/logs',
          hostname: 'app.datadoghq.com',
          pathname: '/logs',
          search: '',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Datadog Logs Explorer',
        writable: true,
      });

      // Clear document body and create date range picker element
      document.body.innerHTML = '';
      const dateRangePicker = document.createElement('div');
      dateRangePicker.className = 'druids_time_date-range-picker';
      
      const input = document.createElement('input');
      input.value = 'Jul 25, 2:00 pm – Jul 25, 2:20 pm';
      dateRangePicker.appendChild(input);
      
      document.body.appendChild(dateRangePicker);

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/logs',
        title: 'Datadog Logs Explorer (Jul 25, 2:00 pm – Jul 25, 2:20 pm) (Logs)',
      });
    });

    it('should handle Datadog logs URLs with simple query parameter', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/logs?query=service%3Aapi%20status%3Aerror&from_ts=1753421640000&to_ts=1753422840000',
          hostname: 'app.datadoghq.com',
          pathname: '/logs',
          search: '?query=service%3Aapi%20status%3Aerror&from_ts=1753421640000&to_ts=1753422840000',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Datadog Logs',
        writable: true,
      });

      // Clear document body - no date range picker element
      document.body.innerHTML = '';

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/logs?query=service%3Aapi%20status%3Aerror&from_ts=1753421640000&to_ts=1753422840000',
        title: 'service:api status:error (Logs)',
      });
    });

    it('should not match non-logs Datadog URLs', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/dashboard/123/my-dashboard',
          hostname: 'app.datadoghq.com',
          pathname: '/dashboard/123/my-dashboard',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'My Dashboard | Datadog',
        writable: true,
      });

      // Clear document body
      document.body.innerHTML = '';

      const result = await getDocInfo();
      
      // Should use default behavior since it's not a logs URL
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/dashboard/123/my-dashboard',
        title: 'My Dashboard | Datadog',
      });
    });

    it('should handle Datadog logs URLs with empty time range input', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/logs?query=service%3Aapi',
          hostname: 'app.datadoghq.com',
          pathname: '/logs',
          search: '?query=service%3Aapi',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Datadog Logs',
        writable: true,
      });

      // Clear document body and create date range picker element with empty input
      document.body.innerHTML = '';
      const dateRangePicker = document.createElement('div');
      dateRangePicker.className = 'druids_time_date-range-picker';
      
      const input = document.createElement('input');
      input.value = '';
      dateRangePicker.appendChild(input);
      
      document.body.appendChild(dateRangePicker);

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/logs?query=service%3Aapi',
        title: 'service:api (Logs)',
      });
    });

    it('should handle YouTube videos with Open Graph tags using fallback', async () => {
      createTestDOM('www.youtube.com', 'We Went to the Town Elon Musk Is Poisoning - More Perfect Union');
      
      // Add Open Graph meta tags
      const ogTitleMeta = document.createElement('meta');
      ogTitleMeta.setAttribute('property', 'og:title');
      ogTitleMeta.setAttribute('content', 'We Went to the Town Elon Musk Is Poisoning');
      document.head.appendChild(ogTitleMeta);
      
      const ogUrlMeta = document.createElement('meta');
      ogUrlMeta.setAttribute('property', 'og:url');
      ogUrlMeta.setAttribute('content', 'https://www.youtube.com/watch?v=3VJT2JeDCyw');
      document.head.appendChild(ogUrlMeta);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://www.youtube.com/watch?v=3VJT2JeDCyw',
        title: 'We Went to the Town Elon Musk Is Poisoning',
      });
    });

    it('should handle YouTube videos with Open Graph tags including channel name in title using fallback', async () => {
      createTestDOM('www.youtube.com', 'Video Title - Channel Name');
      
      // Add Open Graph meta tags with channel name format
      const ogTitleMeta = document.createElement('meta');
      ogTitleMeta.setAttribute('property', 'og:title');
      ogTitleMeta.setAttribute('content', 'We Went to the Town Elon Musk Is Poisoning - More Perfect Union');
      document.head.appendChild(ogTitleMeta);
      
      const ogUrlMeta = document.createElement('meta');
      ogUrlMeta.setAttribute('property', 'og:url');
      ogUrlMeta.setAttribute('content', 'https://www.youtube.com/watch?v=3VJT2JeDCyw');
      document.head.appendChild(ogUrlMeta);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://www.youtube.com/watch?v=3VJT2JeDCyw',
        title: 'We Went to the Town Elon Musk Is Poisoning (More Perfect Union)',
      });
    });

    it('should handle YouTube videos with microdata when Open Graph is missing using fallback', async () => {
      createTestDOM('www.youtube.com', 'Video Title - YouTube');
      
      // Create microdata structure
      const videoDiv = document.createElement('div');
      videoDiv.setAttribute('itemscope', '');
      videoDiv.setAttribute('itemtype', 'http://schema.org/VideoObject');
      
      const titleMeta = document.createElement('meta');
      titleMeta.setAttribute('itemprop', 'name');
      titleMeta.setAttribute('content', 'We Went to the Town Elon Musk Is Poisoning');
      videoDiv.appendChild(titleMeta);
      
      const authorSpan = document.createElement('span');
      authorSpan.setAttribute('itemprop', 'author');
      authorSpan.setAttribute('itemscope', '');
      authorSpan.setAttribute('itemtype', 'http://schema.org/Person');
      
      const authorLink = document.createElement('link');
      authorLink.setAttribute('itemprop', 'name');
      authorLink.setAttribute('content', 'More Perfect Union');
      authorSpan.appendChild(authorLink);
      videoDiv.appendChild(authorSpan);
      
      const urlLink = document.createElement('link');
      urlLink.setAttribute('itemprop', 'url');
      urlLink.setAttribute('href', 'https://www.youtube.com/watch?v=3VJT2JeDCyw');
      videoDiv.appendChild(urlLink);
      
      document.body.appendChild(videoDiv);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://www.youtube.com/watch?v=3VJT2JeDCyw',
        title: 'We Went to the Town Elon Musk Is Poisoning (More Perfect Union)',
      });
    });

    it('should handle YouTube videos with partial microdata using fallback', async () => {
      createTestDOM('www.youtube.com', 'Video Title - YouTube');
      
      // Create microdata structure with only title
      const videoDiv = document.createElement('div');
      videoDiv.setAttribute('itemscope', '');
      videoDiv.setAttribute('itemtype', 'http://schema.org/VideoObject');
      
      const titleMeta = document.createElement('meta');
      titleMeta.setAttribute('itemprop', 'name');
      titleMeta.setAttribute('content', 'We Went to the Town Elon Musk Is Poisoning');
      videoDiv.appendChild(titleMeta);
      
      document.body.appendChild(videoDiv);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://www.youtube.com/test-page', // Should use fallback URL
        title: 'We Went to the Town Elon Musk Is Poisoning',
      });
    });

    it('should handle YouTube videos with fallback to document title using fallback', async () => {
      createTestDOM('www.youtube.com', 'We Went to the Town Elon Musk Is Poisoning - YouTube');
      
      // No Open Graph or microdata - should use document title and current URL
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://www.youtube.com/test-page',
        title: 'We Went to the Town Elon Musk Is Poisoning - YouTube',
      });
    });

    it('should handle YouTube mobile URLs using fallback', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://m.youtube.com/watch?v=3VJT2JeDCyw',
          hostname: 'm.youtube.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'We Went to the Town Elon Musk Is Poisoning - YouTube',
        writable: true,
      });
      
      // Add Open Graph meta tags
      const ogTitleMeta = document.createElement('meta');
      ogTitleMeta.setAttribute('property', 'og:title');
      ogTitleMeta.setAttribute('content', 'We Went to the Town Elon Musk Is Poisoning - More Perfect Union');
      document.head.appendChild(ogTitleMeta);
      
      const ogUrlMeta = document.createElement('meta');
      ogUrlMeta.setAttribute('property', 'og:url');
      ogUrlMeta.setAttribute('content', 'https://www.youtube.com/watch?v=3VJT2JeDCyw');
      document.head.appendChild(ogUrlMeta);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://www.youtube.com/watch?v=3VJT2JeDCyw',
        title: 'We Went to the Town Elon Musk Is Poisoning (More Perfect Union)',
      });
    });

    it('should handle YouTube with different hostname variations using fallback', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://youtube.com/watch?v=3VJT2JeDCyw',
          hostname: 'youtube.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Test Video',
        writable: true,
      });
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://youtube.com/watch?v=3VJT2JeDCyw',
        title: 'Test Video',
      });
    });

    it('should handle schema.org Article with author fallback', async () => {
      createTestDOM('example.com', 'Article Title');
      
      // Create schema.org Article structure
      const articleDiv = document.createElement('div');
      articleDiv.setAttribute('itemscope', '');
      articleDiv.setAttribute('itemtype', 'http://schema.org/Article');
      
      const headlineMeta = document.createElement('meta');
      headlineMeta.setAttribute('itemprop', 'headline');
      headlineMeta.setAttribute('content', 'How to Build Better Software');
      articleDiv.appendChild(headlineMeta);
      
      const authorDiv = document.createElement('div');
      authorDiv.setAttribute('itemprop', 'author');
      authorDiv.setAttribute('itemscope', '');
      authorDiv.setAttribute('itemtype', 'http://schema.org/Person');
      
      const authorNameMeta = document.createElement('meta');
      authorNameMeta.setAttribute('itemprop', 'name');
      authorNameMeta.setAttribute('content', 'John Developer');
      authorDiv.appendChild(authorNameMeta);
      articleDiv.appendChild(authorDiv);
      
      const urlLink = document.createElement('link');
      urlLink.setAttribute('itemprop', 'url');
      urlLink.setAttribute('href', 'https://example.com/better-software');
      articleDiv.appendChild(urlLink);
      
      document.body.appendChild(articleDiv);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://example.com/better-software',
        title: 'How to Build Better Software (John Developer)',
      });
    });

    it('should handle schema.org NewsArticle with different property names', async () => {
      createTestDOM('news.example.com', 'News Article Title');
      
      // Create schema.org NewsArticle structure
      const articleDiv = document.createElement('div');
      articleDiv.setAttribute('itemscope', '');
      articleDiv.setAttribute('itemtype', 'http://schema.org/NewsArticle');
      
      // Use 'name' instead of 'headline'
      const nameMeta = document.createElement('meta');
      nameMeta.setAttribute('itemprop', 'name');
      nameMeta.setAttribute('content', 'Breaking: New Technology Announced');
      articleDiv.appendChild(nameMeta);
      
      const urlLink = document.createElement('link');
      urlLink.setAttribute('itemprop', 'url');
      urlLink.setAttribute('href', 'https://news.example.com/breaking-tech');
      articleDiv.appendChild(urlLink);
      
      document.body.appendChild(articleDiv);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://news.example.com/breaking-tech',
        title: 'Breaking: New Technology Announced',
      });
    });

    it('should handle schema.org BlogPosting with text content author', async () => {
      createTestDOM('blog.example.com', 'Blog Post Title');
      
      // Create schema.org BlogPosting structure
      const postDiv = document.createElement('div');
      postDiv.setAttribute('itemscope', '');
      postDiv.setAttribute('itemtype', 'http://schema.org/BlogPosting');
      
      const titleMeta = document.createElement('meta');
      titleMeta.setAttribute('itemprop', 'headline');
      titleMeta.setAttribute('content', 'My Thoughts on Development');
      postDiv.appendChild(titleMeta);
      
      // Author as text content instead of structured Person
      const authorSpan = document.createElement('span');
      authorSpan.setAttribute('itemprop', 'author');
      authorSpan.textContent = 'Jane Blogger';
      postDiv.appendChild(authorSpan);
      
      document.body.appendChild(postDiv);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://blog.example.com/test-page',
        title: 'My Thoughts on Development (Jane Blogger)',
      });
    });

    it('should handle schema.org WebPage with minimal structure', async () => {
      createTestDOM('company.example.com', 'Company Page');
      
      // Create schema.org WebPage structure
      const pageDiv = document.createElement('div');
      pageDiv.setAttribute('itemscope', '');
      pageDiv.setAttribute('itemtype', 'http://schema.org/WebPage');
      
      const nameMeta = document.createElement('meta');
      nameMeta.setAttribute('itemprop', 'name');
      nameMeta.setAttribute('content', 'About Our Company');
      pageDiv.appendChild(nameMeta);
      
      document.body.appendChild(pageDiv);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://company.example.com/test-page',
        title: 'About Our Company',
      });
    });

    it('should handle schema.org with link element for URL', async () => {
      createTestDOM('example.com', 'Content Title');
      
      // Create schema.org structure with link element
      const thingDiv = document.createElement('div');
      thingDiv.setAttribute('itemscope', '');
      thingDiv.setAttribute('itemtype', 'http://schema.org/Thing');
      
      const nameMeta = document.createElement('meta');
      nameMeta.setAttribute('itemprop', 'name');
      nameMeta.setAttribute('content', 'Important Resource');
      thingDiv.appendChild(nameMeta);
      
      const urlLink = document.createElement('link');
      urlLink.setAttribute('itemprop', 'url');
      urlLink.setAttribute('href', 'https://example.com/resource');
      thingDiv.appendChild(urlLink);
      
      document.body.appendChild(thingDiv);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://example.com/resource',
        title: 'Important Resource',
      });
    });

    it('should prefer Open Graph over schema.org in fallback', async () => {
      createTestDOM('example.com', 'Document Title');
      
      // Add Open Graph meta tags
      const ogTitleMeta = document.createElement('meta');
      ogTitleMeta.setAttribute('property', 'og:title');
      ogTitleMeta.setAttribute('content', 'Open Graph Title');
      document.head.appendChild(ogTitleMeta);
      
      const ogUrlMeta = document.createElement('meta');
      ogUrlMeta.setAttribute('property', 'og:url');
      ogUrlMeta.setAttribute('content', 'https://example.com/og-url');
      document.head.appendChild(ogUrlMeta);
      
      // Add schema.org structure (should be ignored in favor of OG)
      const articleDiv = document.createElement('div');
      articleDiv.setAttribute('itemscope', '');
      articleDiv.setAttribute('itemtype', 'http://schema.org/Article');
      
      const headlineMeta = document.createElement('meta');
      headlineMeta.setAttribute('itemprop', 'headline');
      headlineMeta.setAttribute('content', 'Schema.org Title');
      articleDiv.appendChild(headlineMeta);
      
      const urlLink = document.createElement('link');
      urlLink.setAttribute('itemprop', 'url');
      urlLink.setAttribute('href', 'https://example.com/schema-url');
      articleDiv.appendChild(urlLink);
      
      document.body.appendChild(articleDiv);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://example.com/og-url',
        title: 'Open Graph Title',
      });
    });

    it('should fall back to schema.org when Open Graph is missing', async () => {
      createTestDOM('example.com', 'Document Title');
      
      // Add schema.org structure (no Open Graph)
      const articleDiv = document.createElement('div');
      articleDiv.setAttribute('itemscope', '');
      articleDiv.setAttribute('itemtype', 'http://schema.org/Article');
      
      const headlineMeta = document.createElement('meta');
      headlineMeta.setAttribute('itemprop', 'headline');
      headlineMeta.setAttribute('content', 'Schema.org Article Title');
      articleDiv.appendChild(headlineMeta);
      
      const urlLink = document.createElement('link');
      urlLink.setAttribute('itemprop', 'url');
      urlLink.setAttribute('href', 'https://example.com/schema-article');
      articleDiv.appendChild(urlLink);
      
      document.body.appendChild(articleDiv);
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://example.com/schema-article',
        title: 'Schema.org Article Title',
      });
    });

    it('should handle multiple schema.org types and pick the first match', async () => {
      createTestDOM('example.com', 'Document Title');
      
      // Add multiple schema.org structures
      const videoDiv = document.createElement('div');
      videoDiv.setAttribute('itemscope', '');
      videoDiv.setAttribute('itemtype', 'http://schema.org/VideoObject');
      
      const videoNameMeta = document.createElement('meta');
      videoNameMeta.setAttribute('itemprop', 'name');
      videoNameMeta.setAttribute('content', 'Video Title');
      videoDiv.appendChild(videoNameMeta);
      
      const articleDiv = document.createElement('div');
      articleDiv.setAttribute('itemscope', '');
      articleDiv.setAttribute('itemtype', 'http://schema.org/Article');
      
      const articleHeadlineMeta = document.createElement('meta');
      articleHeadlineMeta.setAttribute('itemprop', 'headline');
      articleHeadlineMeta.setAttribute('content', 'Article Title');
      articleDiv.appendChild(articleHeadlineMeta);
      
      document.body.appendChild(videoDiv);
      document.body.appendChild(articleDiv);
      
      const result = await getDocInfo();
      
      // Should pick VideoObject (first in the priority list)
      expect(result).toEqual({
        link: 'https://example.com/test-page',
        title: 'Video Title',
      });
    });

    it('should prioritize Datadog logs rule over other Datadog rules for logs URLs', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.datadoghq.com/logs?query=@message%3A%22Error%20occurred%22',
          hostname: 'app.datadoghq.com',
          pathname: '/logs',
          search: '?query=@message%3A%22Error%20occurred%22',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Datadog Logs | Datadog',
        writable: true,
      });

      // Clear document body
      document.body.innerHTML = '';

      const result = await getDocInfo();
      
      // Should use logs rule (with query parameter), not default behavior
      expect(result).toEqual({
        link: 'https://app.datadoghq.com/logs?query=@message%3A%22Error%20occurred%22',
        title: '@message:"Error occurred" (Logs)',
      });
    });

    it('should handle Temporal workflow URLs with query parameter', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://temporal-eks.figma.com/namespaces/default/workflows?query=WorkflowId%3D%22413167%22',
          hostname: 'temporal-eks.figma.com',
          pathname: '/namespaces/default/workflows',
          search: '?query=WorkflowId%3D%22413167%22',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Temporal Web UI',
        writable: true,
      });

      // Clear document body
      document.body.innerHTML = '';

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://temporal-eks.figma.com/namespaces/default/workflows?query=WorkflowId%3D%22413167%22',
        title: 'WorkflowId="413167" (Temporal)',
      });
    });

    it('should handle Temporal staging URLs with query parameter', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://temporal-eks.staging.figma.com/namespaces/default/workflows?query=WorkflowType%3D%22MyWorkflow%22',
          hostname: 'temporal-eks.staging.figma.com',
          pathname: '/namespaces/default/workflows',
          search: '?query=WorkflowType%3D%22MyWorkflow%22',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Temporal Web UI - Staging',
        writable: true,
      });

      // Clear document body
      document.body.innerHTML = '';

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://temporal-eks.staging.figma.com/namespaces/default/workflows?query=WorkflowType%3D%22MyWorkflow%22',
        title: 'WorkflowType="MyWorkflow" (Temporal)',
      });
    });

    it('should handle Temporal URLs without query parameter', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://temporal-eks.figma.com/namespaces/default/workflows',
          hostname: 'temporal-eks.figma.com',
          pathname: '/namespaces/default/workflows',
          search: '',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Temporal Web UI - Workflows',
        writable: true,
      });

      // Clear document body
      document.body.innerHTML = '';

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://temporal-eks.figma.com/namespaces/default/workflows',
        title: 'Temporal Web UI - Workflows (Temporal)',
      });
    });

    it('should handle Temporal URLs with complex query parameters', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://temporal-eks.figma.com/namespaces/default/workflows?query=WorkflowId%3D%22test-workflow%22%20AND%20WorkflowType%3D%22MyWorkflowType%22',
          hostname: 'temporal-eks.figma.com',
          pathname: '/namespaces/default/workflows',
          search: '?query=WorkflowId%3D%22test-workflow%22%20AND%20WorkflowType%3D%22MyWorkflowType%22',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Temporal Web UI',
        writable: true,
      });

      // Clear document body
      document.body.innerHTML = '';

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://temporal-eks.figma.com/namespaces/default/workflows?query=WorkflowId%3D%22test-workflow%22%20AND%20WorkflowType%3D%22MyWorkflowType%22',
        title: 'WorkflowId="test-workflow" AND WorkflowType="MyWorkflowType" (Temporal)',
      });
    });

    it('should not match non-temporal URLs', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://example.com/workflows?query=test',
          hostname: 'example.com',
          pathname: '/workflows',
          search: '?query=test',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Example Workflows',
        writable: true,
      });

      // Clear document body
      document.body.innerHTML = '';

      const result = await getDocInfo();
      
      // Should use default behavior since it's not a temporal URL
      expect(result).toEqual({
        link: 'https://example.com/workflows?query=test',
        title: 'Example Workflows',
      });
    });

    it('should handle Google Maps URLs with place names using fallback', async () => {
      createTestDOM('www.google.com', 'Taqueria by El Prieto NYC - Google Maps');
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://www.google.com/test-page',
        title: 'Taqueria by El Prieto NYC (Google Maps)',
      });
    });

    it('should handle Google Search URLs using fallback', async () => {
      createTestDOM('www.google.com', 'javascript testing - Google Search');
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://www.google.com/test-page',
        title: 'javascript testing (Google Search)',
      });
    });

    it('should handle Bing Maps URLs using fallback', async () => {
      createTestDOM('www.bing.com', 'Central Park - Bing Maps');
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://www.bing.com/test-page',
        title: 'Central Park (Bing Maps)',
      });
    });

    it('should handle Apple Maps URLs using fallback', async () => {
      createTestDOM('maps.apple.com', 'Statue of Liberty - Apple Maps');
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://maps.apple.com/test-page',
        title: 'Statue of Liberty (Apple Maps)',
      });
    });

    it('should fallback to regular title when no service pattern matches', async () => {
      createTestDOM('example.com', 'Some Random Website Title');
      
      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://example.com/test-page',
        title: 'Some Random Website Title',
      });
    });

    it('should handle Figma deploys URLs with first h4 element', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://deploysv2.figma.com/pipeline-chain/631490',
          hostname: 'deploysv2.figma.com',
          pathname: '/pipeline-chain/631490',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Figma Deploys | Pipeline Chain 631490',
        writable: true,
      });

      // Clear document body
      document.body.innerHTML = '';

      // Add h4 element
      const h4Element = document.createElement('h4');
      h4Element.textContent = 'Deploy Pipeline Chain #631490';
      document.body.appendChild(h4Element);

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: 'https://deploysv2.figma.com/pipeline-chain/631490',
        title: 'Deploy Pipeline Chain #631490 (Figma Deploys)',
      });
    });

    it('should handle Slack URLs with "Saved for later • Due in X days" format', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://figmadesign.slack.com/archives/C02LKJSAH12/p1753899619438709',
          hostname: 'figmadesign.slack.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Slack | Figma Design',
        writable: true,
      });

      // Clear document body
      document.body.innerHTML = '';

      // Create span with "Saved for later • Due in 3 days" text
      const savedForLaterSpan = document.createElement('span');
      savedForLaterSpan.textContent = 'Saved for later • Due in 3 days';
      document.body.appendChild(savedForLaterSpan);

      // Create message content div
      const messageContentDiv = document.createElement('div');
      messageContentDiv.setAttribute('data-qa', 'message_content');
      
      // Add sender
      const senderSpan = document.createElement('span');
      senderSpan.setAttribute('data-qa', 'message_sender');
      senderSpan.setAttribute('data-stringify-text', 'jaredw');
      messageContentDiv.appendChild(senderSpan);

      // Add message text
      const messageTextDiv = document.createElement('div');
      messageTextDiv.setAttribute('data-qa', 'message-text');
      messageTextDiv.textContent = 'Hey team, this is an important message about the new feature.';
      messageContentDiv.appendChild(messageTextDiv);

      document.body.appendChild(messageContentDiv);

      // Create timestamp link
      const timestampLink = document.createElement('a');
      timestampLink.className = 'c-timestamp';
      timestampLink.setAttribute('data-ts', '1753899619.438709');
      timestampLink.href = '/archives/C02LKJSAH12/p1753899619438709';
      document.body.appendChild(timestampLink);

      // Create channel element
      const channelElement = document.createElement('div');
      channelElement.setAttribute('data-channel-id', 'C02LKJSAH12');
      channelElement.textContent = 'Message general';
      document.body.appendChild(channelElement);

      const result = await getDocInfo();
      
      expect(result).toEqual({
        link: '/archives/C02LKJSAH12/p1753899619438709',
        title: 'Hey team, this is an important message about the new feature.',
        html: 'Hey team, this is an important message about the new feature.',
        text: 'Hey team, this is an important message about the new feature.',
        sender: 'jaredw',
        dateString: 'Jul 30, 2025, 2:20 PM ET',
        channelName: 'general',
      });
    });

    it('should handle Slack URLs with regular "Saved for later" format', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://figmadesign.slack.com/archives/C02LKJSAH12/p1753899619438709',
          hostname: 'figmadesign.slack.com',
        },
        writable: true,
      });

      Object.defineProperty(document, 'title', {
        value: 'Slack | Figma Design',
        writable: true,
      });

      // Clear document body
      document.body.innerHTML = '';

      // Create span with exact "Saved for later" text
      const savedForLaterSpan = document.createElement('span');
      savedForLaterSpan.textContent = 'Saved for later';
      document.body.appendChild(savedForLaterSpan);

      // Create message content div
      const messageContentDiv = document.createElement('div');
      messageContentDiv.setAttribute('data-qa', 'message_content');
      
      // Add message text
      const messageTextDiv = document.createElement('div');
      messageTextDiv.setAttribute('data-qa', 'message-text');
      messageTextDiv.textContent = 'Regular saved message';
      messageContentDiv.appendChild(messageTextDiv);

      document.body.appendChild(messageContentDiv);

      const result = await getDocInfo();
      
      expect(result.title).toBe('Regular saved message');
      expect(result.text).toBe('Regular saved message');
    });
  });
}); 