import * as fs from "fs";
import * as path from "path";

interface TemplateData {
  [key: string]: any;
}

interface LayoutData {
  title: string;
  headerColor: string;
  content: string;
}

export class TemplateLoader {
  private templatesDir: string;
  private layoutCache: string | null = null;

  constructor(templatesDir?: string) {
    this.templatesDir =
      templatesDir || path.join(__dirname, "..", "templates", "emails");
  }

  /**
   * Load and cache the base layout template
   */
  private loadLayout(): string {
    if (this.layoutCache) {
      return this.layoutCache;
    }

    const layoutPath = path.join(this.templatesDir, "_layout.html");
    this.layoutCache = fs.readFileSync(layoutPath, "utf-8");
    return this.layoutCache;
  }

  /**
   * Load a content template file
   */
  private loadTemplate(templateName: string): string {
    const templatePath = path.join(this.templatesDir, `${templateName}.html`);
    return fs.readFileSync(templatePath, "utf-8");
  }

  /**
   * Replace template variables with actual values
   * Supports {{variable}} syntax and {{#if variable}}...{{/if}} conditionals
   */
  private replaceVariables(template: string, data: TemplateData): string {
    let result = template;

    // Handle conditional blocks {{#if variable}}...{{/if}}
    result = result.replace(
      /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (match, variable, content) => {
        return data[variable] ? content : "";
      },
    );

    // Handle simple variable replacements {{variable}}
    result = result.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      return data[variable] !== undefined ? String(data[variable]) : match;
    });

    return result;
  }

  /**
   * Render a template with data
   */
  render(
    templateName: string,
    data: TemplateData,
    layoutData: { title: string; headerColor: string },
  ): string {
    // Load the content template
    const contentTemplate = this.loadTemplate(templateName);

    // Replace variables in the content
    const renderedContent = this.replaceVariables(contentTemplate, data);

    // Load the layout
    const layout = this.loadLayout();

    // Combine layout data with rendered content
    const fullLayoutData: LayoutData = {
      ...layoutData,
      content: renderedContent,
    };

    // Replace variables in the layout
    return this.replaceVariables(layout, fullLayoutData);
  }

  /**
   * Clear the layout cache (useful for testing)
   */
  clearCache(): void {
    this.layoutCache = null;
  }
}

export const templateLoader = new TemplateLoader();
