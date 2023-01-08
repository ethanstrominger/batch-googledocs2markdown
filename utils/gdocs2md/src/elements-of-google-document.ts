// const yamljs = require("yamljs");
const _get = require("lodash/get");
const _repeat = require("lodash/repeat");
const _merge = require("lodash/merge");
const path = require("path");

const json2md = require("./json2md-extended");
const { isCodeBlocks, isQuote } = require("./google-document-types");
const { DEFAULT_OPTIONS } = require("./constants");
const { getFrontMatterFromGdoc } = require("./utils.js");
const { normalizeElement } = require("./normalize-element");
const { downloadImageFromURL } = require("./download-image");

const HORIZONTAL_TAB_CHAR = "\x09";
const GOOGLE_DOCS_INDENT = 18;
type ConstructorValues = {
  document: any;
  properties: any;
  options: any;
  links: any;
};

class ElementsOfGoogleDocument {
  document: any;
  links: any;
  properties: any;
  options: any;
  elements: any;
  cover: any;
  headings: any;
  footnotes: any;
  related: any;
  bodyFontSize: any;

  constructor({
    document,
    properties = {},
    options = {},
    links = {},
  }: ConstructorValues) {
    this.document = document;
    this.links = links;
    this.properties = properties;
    this.options = _merge({}, DEFAULT_OPTIONS, options);
  }

  formatText(
    el: {
      inlineObjectElement: {
        inlineObjectId: any;
        textStyle: { link: { url: any } };
      };
      textRun: { content: string; textStyle: any };
    },
    { inlineImages = false, namedStyleType = "NORMAL_TEXT" } = {}
  ) {
    if (el.inlineObjectElement) {
      const image = this.getImage(el) as any;
      if (image) {
        image.alt = image.alt || image.title || "img";
        const relativeFilename = path.join(
          `${this.properties.path ? this.properties.path : "index"}-${
            el.inlineObjectElement.inlineObjectId
          }-gdoc.png`
        );
        const relativeTargetUrl = `${this.properties.slug}-${el.inlineObjectElement.inlineObjectId}-gdoc.png`;
        const filename = path.join(
          this.options.imagesTarget || this.options.targetMarkdownDir,
          relativeTargetUrl
        );
        // todo: change to have separate var for slug path and slug
        image.targetSource = path.join("/assets/images", relativeTargetUrl);
        // console.log("Downloading image", filename);
        downloadImageFromURL(
          image.source,
          filename
          // el.inlineObjectElement.inlineObjectId
        );
        // if (inlineImages) {
        let html = `<img src="${image.targetSource}" title="${image.title}" alt="${image.alt}" height="${image.height}" width="${image.width}">`;
        if (el.inlineObjectElement.textStyle.link) {
          html = `<a href="${el.inlineObjectElement.textStyle.link.url}">${html}</a>`;
        }
        return html;
        // }
        // this.elements.push({
        //   type: "imgextension",
        //   value: image,
        // });
      }
    }

    if (!el.textRun || !el.textRun.content || !el.textRun.content.trim()) {
      return "";
    }

    let text = el.textRun.content
      .replace(/\n$/, "") // Remove new lines
      .replace(/“|”/g, '"'); // Replace smart quotes by double quotes
    const contentMatch = text.match(/^(\s*)(\S+(?:[ \t\v]*\S+)*)(\s*)$/) as any; // Match "text", "before" and "after"
    const before = contentMatch[1];
    const after = contentMatch[3];
    text = contentMatch[2];

    const defaultStyle = this.getTextStyle(namedStyleType);
    const textStyle = el.textRun.textStyle;
    const style = this.options.keepDefaultStyle
      ? _merge({}, defaultStyle, textStyle)
      : textStyle;

    const {
      backgroundColor,
      baselineOffset,
      bold,
      fontSize,
      foregroundColor,
      italic,
      link,
      strikethrough,
      underline,
      weightedFontFamily: { fontFamily } = { fontFamily: "" },
    } = style;

    const isInlineCode = fontFamily === "Consolas";
    if (isInlineCode) {
      if (this.options.skipCodes) return text;

      return "`" + text + "`";
    }

    const styles = [];

    text = text.replace(/\*/g, "\\*"); // Prevent * to be bold
    text = text.replace(/_/g, "\\_"); // Prevent _ to be italic

    if (baselineOffset === "SUPERSCRIPT") {
      text = `<sup>${text}</sup>`;
    }

    if (baselineOffset === "SUBSCRIPT") {
      text = `<sub>${text}</sub>`;
    }

    if (underline && !link) {
      text = `<ins>${text}</ins>`;
    }

    if (italic) {
      text = `_${text}_`;
    }

    if (bold) {
      text = `**${text}**`;
    }

    if (strikethrough) {
      text = `~~${text}~~`;
    }

    if (fontSize) {
      const em = (fontSize.magnitude / this.bodyFontSize).toFixed(2);
      if (em !== "1.00") {
        styles.push(`font-size:${em}em`);
      }
    }

    if (_get(foregroundColor, ["color", "rgbColor"]) && !link) {
      const { rgbColor } = foregroundColor.color;
      const red = Math.round((rgbColor.red || 0) * 255);
      const green = Math.round((rgbColor.green || 0) * 255);
      const blue = Math.round((rgbColor.blue || 0) * 255);
      if (red !== 0 || green !== 0 || blue !== 0) {
        styles.push(`color:rgb(${red}, ${green}, ${blue})`);
      }
    }

    if (_get(backgroundColor, ["color", "rgbColor"]) && !link) {
      const { rgbColor } = backgroundColor.color;
      const red = Math.round((rgbColor.red || 0) * 255);
      const green = Math.round((rgbColor.green || 0) * 255);
      const blue = Math.round((rgbColor.blue || 0) * 255);
      styles.push(`background-color:rgb(${red}, ${green}, ${blue})`);
    }

    if (styles.length > 0) {
      text = `<span style='${styles.join(";")}'>${text}</span>`;
    }

    if (link) {
      return `${before}[${text}](${link.url})${after}`;
    }

    return before + text + after;
  }

  getTextStyle(type: string) {
    const documentStyles = _get(this.document, ["namedStyles", "styles"]);

    if (!documentStyles) return {};

    const style = documentStyles.find(
      (style: { namedStyleType: any }) => style.namedStyleType === type
    );
    return style.textStyle;
  }

  getImage(el: { inlineObjectElement: { inlineObjectId: string | number } }) {
    if (this.options.skipImages) return;

    const { inlineObjects } = this.document;

    if (!inlineObjects || !el.inlineObjectElement) {
      return;
    }

    const inlineObject = inlineObjects[el.inlineObjectElement.inlineObjectId];
    const embeddedObject = inlineObject.inlineObjectProperties.embeddedObject;
    const size = embeddedObject.size;

    return {
      source: embeddedObject.imageProperties.contentUri,
      title: embeddedObject.title || "",
      alt: embeddedObject.description || "",
      height: Math.round(size?.height?.magnitude) + size?.height?.unit || "",
      width: Math.round(size?.width?.magnitude) + size?.width?.unit || "",
    };
  }

  processCover() {
    const { headers, documentStyle } = this.document;
    const firstPageHeaderId = _get(documentStyle, ["firstPageHeaderId"]);

    if (!firstPageHeaderId) {
      return;
    }

    const headerElement = _get(headers[firstPageHeaderId], [
      "content",
      0,
      "paragraph",
      "elements",
      0,
    ]);

    const image = this.getImage(headerElement);

    if (image) {
      this.cover = {
        image: image.source,
        title: image.title,
        alt: image.alt,
      };
    }
  }

  getTableCellContent(content: { paragraph: any }[]) {
    return content
      .map(({ paragraph }) => paragraph.elements.map(this.formatText).join(""))
      .join("")
      .replace(/\n/g, "<br/>"); // Replace newline characters by <br/> to avoid multi-paragraphs
  }

  indentText(text: any, level: number) {
    return `${_repeat(HORIZONTAL_TAB_CHAR, level)}${text}`;
  }

  stringifyContent(tagContent: any[]) {
    return tagContent.join("").replace(/\n$/, "");
  }

  appendToList({ list, listItem, elementLevel, level }: any) {
    const lastItem = list[list.length - 1];

    if (listItem.level > level) {
      if (typeof lastItem === "object") {
        this.appendToList({
          list: lastItem.value,
          listItem,
          elementLevel,
          level: level + 1,
        });
      } else {
        list.push({
          type: listItem.tag,
          value: [listItem.text],
        });
      }
    } else {
      list.push(listItem.text);
    }
  }

  getListTag(listId: any, level: number) {
    const glyph = _get(this.document, [
      "lists",
      listId,
      "listProperties",
      "nestingLevels",
      level,
      "glyphType",
    ]);

    return glyph ? "ol" : "ul";
  }

  processList(
    paragraph: {
      bullet: { listId?: any; nestingLevel?: any };
      elements: any[];
    },
    index: number
  ) {
    if (this.options.skipLists) return;

    const prevListId = _get(this.document, [
      "body",
      "content",
      index - 1,
      "paragraph",
      "bullet",
      "listId",
    ]);
    const isPrevList = prevListId === paragraph.bullet.listId;
    const prevList = _get(this.elements, [this.elements.length - 1, "value"]);
    const textArray = paragraph.elements.map((el: any) => {
      return this.formatText(el, { inlineImages: true });
    });
    const text = this.stringifyContent(textArray);

    if (isPrevList && Array.isArray(prevList)) {
      const { nestingLevel } = paragraph.bullet;

      if (nestingLevel) {
        this.appendToList({
          list: prevList,
          listItem: {
            text,
            level: nestingLevel,
            tag: this.getListTag(paragraph.bullet.listId, prevList.length),
          },
          level: 0,
        });
      } else {
        prevList.push(text);
      }
    } else {
      this.elements.push({
        type: this.getListTag(paragraph.bullet.listId, 0),
        value: [text],
      });
    }
  }

  processParagraph(
    paragraph: {
      paragraphStyle: { namedStyleType: any; indentStart: { magnitude: any } };
      bullet: any;
      elements: any[];
    },
    index: any
  ) {
    const headingTag = paragraph.paragraphStyle.namedStyleType;
    const { isHeading, tag } = this.getTag(headingTag);

    // Lists
    if (paragraph.bullet) {
      this.processList(paragraph, index);
      return;
    }

    let tagContentArray: string[] = [];

    paragraph.elements.forEach(
      (el: {
        pageBreak: any;
        horizontalRule: any;
        footnoteReference: { footnoteNumber: any; footnoteId: string | number };
      }) => {
        if (el.pageBreak) {
          return;
        }

        // <hr />
        else if (el.horizontalRule) {
          tagContentArray.push("<hr/>");
        }

        // Footnotes
        else if (el.footnoteReference) {
          if (this.options.skipFootnotes) return;

          tagContentArray.push(`[^${el.footnoteReference.footnoteNumber}]`);
          this.footnotes[el.footnoteReference.footnoteId] =
            el.footnoteReference.footnoteNumber;
        }

        // Headings
        else if (isHeading) {
          if (this.options.skipHeadings) return;

          const text = this.formatText(el as any, {
            namedStyleType: headingTag,
          });

          if (text) {
            tagContentArray.push(text);
          }
        }

        // Texts
        else {
          const text = this.formatText(el as any);

          if (text) {
            tagContentArray.push(text);
          }
        }
      }
    );

    if (tagContentArray.length === 0) return;

    let content = this.stringifyContent(tagContentArray);
    let tagIndentLevel = 0;

    if (paragraph.paragraphStyle.indentStart) {
      const { magnitude } = paragraph.paragraphStyle.indentStart;
      tagIndentLevel = Math.round(magnitude / GOOGLE_DOCS_INDENT);
    }

    if (tagIndentLevel > 0) {
      content = this.indentText(content, tagIndentLevel);
    }

    this.elements.push(
      ...this.htmlFormatter({
        paragraph,
        type: tag,
        value: content,
      })
    );

    if (isHeading) {
      /* TODO: refactor code below - define heading when
         creating them, rather than after the fact */
      let indexPos = this.elements.length - 1;
      while (this.elements[indexPos].value !== content) {
        indexPos = indexPos - 1;
      }
      this.headings.push({
        tag,
        text: content,
        indexPos,
      });
    }
  }

  getTag(headingTag: "HEADING_1" | "HEADING_2" | "HEADING_3" | "HEADING_4" | "HEADING_5" | "HEADING_6" | "NORMAL_TEXT" | "SUBTITLE" | "TITLE") {
    const tags = {
      HEADING_1: "h1",
      HEADING_2: "h2",
      HEADING_3: "h3",
      HEADING_4: "h4",
      HEADING_5: "h5",
      HEADING_6: "h6",
      NORMAL_TEXT: "p",
      SUBTITLE: "h2",
      TITLE: "h1",
    };
    const tag = tags[headingTag] as any);
    const isHeading = tag.startsWith("h");
    if (this.options.demoteHeadings === true) {
      this.processDemoteHeadings();
    }
    return { isHeading, tag };
  }

  htmlFormatter({ paragraph, type, value }: any) {
    const alignment = paragraph.paragraphStyle.alignment;
    if (alignment === "CENTER") {
      return [
        {
          type: "html",
          value: '<div class="center" markdown="1">',
        },
        { type, value },
        { type: "html", value: "</div>" },
      ];
    }
    return [{ type, value }];
  }

  processQuote(table: { tableRows: any[] }) {
    if (this.options.skipQuotes) return;

    const firstRow = table.tableRows[0];
    const firstCell = firstRow.tableCells[0];
    const quote = this.getTableCellContent(firstCell.content);
    const blockquote = quote.replace(/“|”/g, ""); // Delete smart-quotes

    this.elements.push({ type: "blockquote", value: blockquote });
  }

  processCode(codeBlock: { tableRows: any[] }) {
    if (this.options.skipCodes) return;

    const firstRow = codeBlock.tableRows[0];
    const firstCell = firstRow.tableCells[0];
    const codeContent = firstCell.content
      .map(({ paragraph }: any) =>
        paragraph.elements
          .map((el: { textRun: { content: any } }) => el.textRun.content)
          .join("")
      )
      .join("")
      .replace(/\x0B/g, "\n") //eslint-disable-line no-control-regex
      .replace(/^\n|\n$/g, "")
      .split("\n");

    // "".split() -> [""]
    if (codeContent.length === 1 && codeContent[0] === "") return;

    let lang = null;
    const langMatch = codeContent[0].match(/^\s*lang:\s*(.*)$/);

    if (langMatch) {
      codeContent.shift();
      lang = langMatch[1];
    }

    this.elements.push({
      type: "code",
      value: {
        language: lang,
        content: codeContent,
      },
    });
  }

  processTable(table: { tableRows: [any, ...any[]] }) {
    if (this.options.skipTables) return;

    const [thead, ...tbody] = table.tableRows;

    this.elements.push({
      type: "table",
      value: {
        headers: thead.tableCells.map(({ content }: any) =>
          this.getTableCellContent(content)
        ),
        rows: tbody.map((row: { tableCells: { content: any }[] }) =>
          row.tableCells.map(({ content }) => this.getTableCellContent(content))
        ),
      },
    });
  }

  processFootnotes() {
    if (this.options.skipFootnotes) return;

    const footnotes: { type: string; value: { number: any; text: any } }[] = [];
    const documentFootnotes = this.document.footnotes;

    if (!documentFootnotes) return;

    Object.entries(documentFootnotes).forEach(([, value]) => {
      const paragraphElements = (value as any).content[0].paragraph.elements;
      const tagContentArray = paragraphElements.map(this.formatText);
      const tagContentString = this.stringifyContent(tagContentArray);

      footnotes.push({
        type: "footnote",
        value: {
          number: this.footnotes[(value as any).footnoteId],
          text: tagContentString,
        },
      });
    });

    footnotes.sort(
      (footnote1, footnote2) =>
        parseInt(footnote1.value.number) - parseInt(footnote2.value.number)
    );

    this.elements.push(...footnotes);
  }

  processDemoteHeadings() {
    this.headings.forEach(
      (heading: { tag: string; indexPos: string | number; text: any }) => {
        const levelevel = Number(heading.tag.substring(1));
        const newLevel = levelevel < 6 ? levelevel + 1 : levelevel;
        this.elements[heading.indexPos] = {
          type: "h" + newLevel,
          value: heading.text,
        };
      }
    );
  }

  processInternalLinks() {
    if (Object.keys(this.links).length > 0) {
      const elementsStringified = JSON.stringify(this.elements);

      const elementsStringifiedWithRelativePaths = elementsStringified.replace(
        /https:\/\/docs.google.com\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)(?:\/edit|\/preview)?/g,
        (match, id) => {
          if (this.links[id]) {
            this.related.push(id);
            return this.links[id];
          }

          return match;
        }
      );

      this.elements = JSON.parse(elementsStringifiedWithRelativePaths);
    }
  }

  process() {
    this.cover = null;
    this.elements = [];
    this.headings = [];
    this.footnotes = {};
    this.related = [];

    // Keep the class scope in loops
    this.formatText = this.formatText.bind(this);
    // this.normalizeElement = this.normalizeElement.bind(this);

    this.bodyFontSize = _get(
      this.getTextStyle("NORMAL_TEXT"),
      "fontSize.magnitude"
    );

    this.processCover();

    this.document.body.content.forEach(
      ({ paragraph, table, sectionBreak, tableOfContents }: any, i: any) => {
        // Unsupported elements
        if (sectionBreak || tableOfContents) {
          return;
        }

        if (table) {
          // Quotes
          if (isQuote(table)) {
            this.processQuote(table);
          }

          // Code Blocks
          else if (isCodeBlocks(table)) {
            this.processCode(table);
          }

          // Tables
          else {
            this.processTable(table);
          }
        }

        // Paragraphs
        else {
          this.processParagraph(paragraph, i);
        }
      }
    );

    // Footnotes
    this.processFootnotes();

    this.processInternalLinks();
  }

  toMarkdown() {
    const json = this.elements.map(normalizeElement);
    const markdownContent = json2md(json);
    const markdownFrontmatter = this.getFrontMatter();

    return `${markdownFrontmatter}${markdownContent}`;
    // return `${markdownFrontmatter}${markdownContent}`;
  }

  getFrontMatter() {
    return getFrontMatterFromGdoc(this);
  }
}

// Add extra converter for footnotes
json2md.converters.footnote = function (footnote: any) {
  return `[^${footnote.number}]:${footnote.text}`;
};

export { ElementsOfGoogleDocument };
// module.exports = {
//   ElementsOfGoogleDocument,
// };
