import { createLocalVue, mount } from "@vue/test-utils";
import fs from "fs";
import markdownIt from "markdown-it";
import nodeEval from "node-eval";
import path from "path";
import React from 'react';
import reactRenderer from 'react-test-renderer';
import Loader from "../index";
import Mode from "../mode";
import ChildComponent from "./child-component";
import CodeConfusing from "./code-confusing";



let loaded;

const defaultContext = {
  cachable: false,
  resourcePath: "/somewhere/frontmatter.md",
  getOptions() { return this.query || {} }
};

const load = (source, context = defaultContext) => {
  const rawLoaded = Loader.call(context, source);
  loaded = nodeEval(rawLoaded, "sample.md");
}

const markdownWithFrontmatter = fs.readFileSync(path.join(__dirname, "with-frontmatter.md"), "utf8");
const markdownWithFrontmatterIncludingChildComponent = fs.readFileSync(path.join(__dirname, "with-frontmatter-including-custom-element.md"), "utf8");
const markdownWithFrontmatterIncludingPascalChildComponent = fs.readFileSync(path.join(__dirname, "with-frontmatter-including-custom-element-by-pascal.md"), "utf8");;

describe("frontmatter-markdown-loader", () => {
  afterEach(() => {
    loaded = undefined;
  });

  describe("against Frontmatter markdown without any option", () => {
    beforeEach(() => {
      load(markdownWithFrontmatter);
    });

    it("returns compiled HTML for 'html' property", () => {
      expect(loaded.html).toBe(
        "<h1>Title</h1>\n<p>GOOD <code>BYE</code> FRIEND\nCHEERS</p>\n<pre><code class=\"language-js\">const templateLiteral = `ok`;\nconst multipleLine = true;\nconsole.warn(multipleLine + &quot;\\n&quot;)\n</code></pre>\n"
      );
    });

    it("returns frontmatter object for 'attributes' property", () => {
      expect(loaded.attributes).toEqual({
        subject: "Hello",
        tags: ["tag1", "tag2"]
      });
    });

    it("doesn't return 'body' property", () => {
      expect(loaded.body).toBeUndefined();
    });

    it("doesn't return 'meta' property", () => {
      expect(loaded.meta).toBeUndefined();
    });

    it("doesn't return 'vue' property", () => {
      expect(loaded.vue).toBeUndefined();
    });

    it("doesn't return 'react' property", () => {
      expect(loaded.react).toBeUndefined();
    });
  });

  describe("markdown option", () => {
    it("returns HTML with custom renderer", () => {
      load(markdownWithFrontmatter, { ...defaultContext, query: { markdown: md => "<p>Compiled markdown by the custom compiler</p>" } });
      expect(loaded.html).toBe("<p>Compiled markdown by the custom compiler</p>");
    });

    it("throws if both markdown and markdownIt are given", () => {
      expect(() => {
        load(markdownWithFrontmatter, { ...defaultContext, query: { markdown: md => "<p>custom</p>", markdownIt: "option" } });
      }).toThrow();
    });
  });

  describe("markdownId option", () => {
    it("returns HTML with configured markdownIt: breaks option is enabled as configuration", () => {
      load(markdownWithFrontmatter, { ...defaultContext, query: { markdownIt: { breaks: true } } });
      expect(loaded.html).toBe(
        "<h1>Title</h1>\n<p>GOOD <code>BYE</code> FRIEND<br>\nCHEERS</p>\n<pre><code class=\"language-js\">const templateLiteral = `ok`;\nconst multipleLine = true;\nconsole.warn(multipleLine + &quot;\\n&quot;)\n</code></pre>\n"
      )
    });

    it("returns HTML with configured markdownIt instance: breaks option is enabled by .enable", () => {
      const markdownItInstance = markdownIt();
      const defaultRender = markdownItInstance.link_open || function(tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
      };
      markdownItInstance.renderer.rules.paragraph_open = function (tokens, idx, options, env, self) {
        tokens[idx].attrPush(['data-paragraph', 'hello']);
        return defaultRender(tokens, idx, options, env, self);
      };

      load(markdownWithFrontmatter, { ...defaultContext, query: { markdownIt: markdownItInstance } });
      expect(loaded.html).toBe(
        "<h1>Title</h1>\n<p data-paragraph=\"hello\">GOOD <code>BYE</code> FRIEND\nCHEERS</p>\n<pre><code class=\"language-js\">const templateLiteral = `ok`;\nconst multipleLine = true;\nconsole.warn(multipleLine + &quot;\\n&quot;)\n</code></pre>\n"
      );
    });
  });

  describe("body mode is enabled", () => {
    it("returns raw markdown body for 'body' property", () => {
      load(markdownWithFrontmatter, { ...defaultContext, query: { mode: [Mode.BODY] } });
      expect(loaded.body).toBe(
        "# Title\n\nGOOD `BYE` FRIEND\nCHEERS\n\n```js\nconst templateLiteral = `ok`;\nconst multipleLine = true;\nconsole.warn(multipleLine + \"\\n\")\n```\n"
      );
    });
  });

  describe("meta mode is enabled", () => {
    it("returns meta data on 'meta' property", () => {
      load(markdownWithFrontmatter, { ...defaultContext, query: { mode: [Mode.META] } });
      expect(loaded.meta).toEqual({
        resourcePath: "/somewhere/frontmatter.md"
      });
    });
  });

  describe("vue related modes", () => {
    const mountComponent = (component) => {
      const localVue = createLocalVue();
      return mount(component, { localVue });
    };

    const buildVueComponent = () => {
      return {
        data () {
          return {
            templateRender: null
          }
        },

        components: { ChildComponent, CodeConfusing },

        render: function (createElement) {
          return this.templateRender ? this.templateRender() : createElement("div", "Rendering");
        },

        created: function () {
          this.templateRender = loaded.vue.render;
          this.$options.staticRenderFns = loaded.vue.staticRenderFns;
        }
      }
    };

    describe("enabling vue-render-functions mode", () => {
      const contextEnablingVueRenderFunctions = (additionalOptions = {}) => ({
        ...defaultContext,
        query: {
          mode: [Mode.VUE_RENDER_FUNCTIONS],
          ...additionalOptions
        }
      });

      describe("missing implicit dependencies", () => {
        afterEach(() => {
          jest.unmock("vue-template-compiler");
          jest.unmock("@vue/component-compiler-utils");
        });

        it("throw if vue-template|compiler is not installed in the project", () => {
          jest.mock('vue-template-compiler', () => {
            const error = new Error()
            error.code = 'MODULE_NOT_FOUND'
            throw error
          });
          expect(() => {
            load(markdownWithFrontmatter, contextEnablingVueRenderFunctions());
          }).toThrow(/Failed to import/);
        });

        it("throw if @vue/component-compiler-utils is not installed in the project", () => {
          jest.mock("@vue/component-compiler-utils", () => {
            const error = new Error()
            error.code = 'MODULE_NOT_FOUND'
            throw error
          });
          expect(() => {
            load(markdownWithFrontmatter, contextEnablingVueRenderFunctions());
          }).toThrow(/Failed to import/);
        });

        it("throw if unintentional exception by importing @vue/component-compiler-utils", () => {
          jest.mock("@vue/component-compiler-utils", () => {
            throw new Error('unintentional problem')
          });
          expect(() => {
            load(markdownWithFrontmatter, contextEnablingVueRenderFunctions());
          }).toThrow('unintentional problem');
        });
      });

      it("doesn't return for 'vue.component'", () => {
        load(markdownWithFrontmatter, contextEnablingVueRenderFunctions());
        expect(loaded.vue.component).not.toBeDefined();
      });

      it("returns 'vue' property which has render and staticRenderFns", () => {
        load(markdownWithFrontmatter, contextEnablingVueRenderFunctions());
        expect(loaded.vue).toBeDefined();
        expect(loaded.vue.render).toBeDefined();
        expect(loaded.vue.staticRenderFns).toBeDefined();
      });

      it("returns functions to run as Vue component giving 'frontmatter-markdown' to class of root element", () => {
        load(markdownWithFrontmatter, contextEnablingVueRenderFunctions());
        const wrapper = mountComponent(buildVueComponent());
        expect(wrapper.attributes().class).toBe("frontmatter-markdown");
      });

      it("returns functions to run as Vue component giving requested name to class of root element", () => {
        load(markdownWithFrontmatter, contextEnablingVueRenderFunctions({ vue: { root: "forJest" } }));
        const wrapper = mountComponent(buildVueComponent());
        expect(wrapper.attributes().class).toBe("forJest");
      });

      it("returns functions to run as Vue component which has the correct template", () => {
        load(markdownWithFrontmatter, contextEnablingVueRenderFunctions({ vue: { root: "forJest" } }));
        const wrapper = mountComponent(buildVueComponent());
        const rootElement = wrapper.find(".forJest");
        expect(rootElement.find("h1").text()).toBe("Title");
        expect(rootElement.find("p").find("code").text()).toBe("BYE");
        expect(rootElement.find("p").text()).toBe("GOOD BYE FRIEND\nCHEERS");
      });

      it("returns functions to run as Vue component which includes child component", () => {
        load(markdownWithFrontmatterIncludingChildComponent, contextEnablingVueRenderFunctions());
        const wrapper = mountComponent(buildVueComponent());
        expect(wrapper.findComponent(ChildComponent).exists()).toBe(true);
        expect(wrapper.find(".childComponent").text()).toBe("Child Vue Component olloeh");
      });
    });

    describe("enabling vue-component mode", () => {
      const contextEnablingVueComponent = (additionalOptions = {}) => ({
        ...defaultContext,
        query: {
          mode: [Mode.VUE_COMPONENT],
          ...additionalOptions
        }
      });

      describe("missing implicit dependencies", () => {
        afterEach(() => {
          jest.unmock("vue-template-compiler");
          jest.unmock("@vue/component-compiler-utils");
        });

        it("throw if vue-template|compiler is not installed in the project", () => {
          jest.mock('vue-template-compiler', () => {
            const error = new Error()
            error.code = 'MODULE_NOT_FOUND'
            throw error
          });
          expect(() => {
            load(markdownWithFrontmatterIncludingChildComponent, contextEnablingVueComponent());
          }).toThrow(/Failed to import/);
        });

        it("throw if @vue/component-compiler-utils is not installed in the project", () => {
          jest.mock("@vue/component-compiler-utils", () => {
            const error = new Error()
            error.code = 'MODULE_NOT_FOUND'
            throw error
          });
          expect(() => {
            load(markdownWithFrontmatterIncludingChildComponent, contextEnablingVueComponent());
          }).toThrow(/Failed to import/);
        });

        it("throw if unintentional exception by importing @vue/component-compiler-utils", () => {
          jest.mock("@vue/component-compiler-utils", () => {
            throw new Error('unintentional problem')
          });
          expect(() => {
            load(markdownWithFrontmatterIncludingChildComponent, contextEnablingVueComponent());
          }).toThrow('unintentional problem');
        });
      });

      it("doesn't return for neither 'vue.render' nor 'vue.staticRenderFns", () => {
        load(markdownWithFrontmatter, contextEnablingVueComponent());
        expect(loaded.vue.render).not.toBeDefined();
        expect(loaded.vue.staticRenderFns).not.toBeDefined();
      });

      it("returns extendable base Vue component", () => {
        load(markdownWithFrontmatterIncludingChildComponent, contextEnablingVueComponent());
        const component = {
          extends: loaded.vue.component,
          components: { ChildComponent, CodeConfusing }
        };
        const wrapper = mountComponent(component);
        expect(wrapper.findComponent(ChildComponent).exists()).toBe(true);
        expect(wrapper.find(".childComponent").text()).toBe("Child Vue Component olloeh");
      });

      it("transforms asset's URL as default", () => {
        load(markdownWithFrontmatterIncludingChildComponent, contextEnablingVueComponent());
        const component = {
          extends: loaded.vue.component,
          components: { ChildComponent, CodeConfusing }
        };
        const wrapper = mountComponent(component);
        expect(wrapper.find("img").attributes("src")).toBe("avatar-through-require.png");
      });

      it("doesn't transform asset's URL as configured", () => {
        load(markdownWithFrontmatterIncludingChildComponent, contextEnablingVueComponent({ vue: { transformAssetUrls: { img: null } } }));
        const component = {
          extends: loaded.vue.component,
          components: { ChildComponent, CodeConfusing }
        };
        const wrapper = mountComponent(component);
        expect(wrapper.find("img").attributes("src")).toBe("./avatar.png.js");
      });

      it("doesn't transform asset's URL as disabled", () => {
        load(markdownWithFrontmatterIncludingChildComponent, contextEnablingVueComponent({ vue: { transformAssetUrls: false } }));
        const component = {
          extends: loaded.vue.component,
          components: { ChildComponent, CodeConfusing }
        };
        const wrapper = mountComponent(component);
        expect(wrapper.find("img").attributes("src")).toBe("./avatar.png.js");
      });

      it("avoids compiling code snipets on markdown", () => {
        load(markdownWithFrontmatterIncludingChildComponent, contextEnablingVueComponent());
        const component = {
          extends: loaded.vue.component,
          components: { ChildComponent, CodeConfusing }
        };
        const wrapper = mountComponent(component);
        const snipets = wrapper.findAll("code");
        expect(snipets).toHaveLength(3);
        expect(snipets.at(0).text()).toContain("<child-component>{{ test->() }}</child-component>");
        expect(snipets.at(1).text()).toContain("<sample-component>{{ app->() }}</sample-component>");
        expect(snipets.at(2).text()).toBe("{{ I shouldn't be evaluated }}");
        expect(wrapper.findComponent(CodeConfusing).exists()).toBe(true);
      });
    });
  });


  describe("react mode", () => {
    describe("missing implicit dependencies", () => {
      afterEach(() => {
        jest.unmock("@babel/core");
        jest.unmock("@babel/preset-react");
      });

      it("throw if @babel/core is not installed in the project", () => {
        jest.mock("@babel/core", () => {
          throw new Error();
        });
        expect(() => {
          load(markdownWithFrontmatter, { ...defaultContext, query: { mode: [Mode.REACT] } });
        }).toThrow();
      });

      it("throw if @babel/preset-react is not installed in the project", () => {
        jest.mock("@babel/preset-react", () => {
          throw new Error();
        });
        expect(() => {
          load(markdownWithFrontmatter, { ...defaultContext, query: { mode: [Mode.REACT] } });
        }).toThrow();
      });
    });

    it("returns renderable React component", () => {
      load(markdownWithFrontmatter, { ...defaultContext, query: { mode: [Mode.REACT] } });
      const MarkdownComponent = loaded.react;
      const rendered = reactRenderer.create(<MarkdownComponent />);
      expect(rendered.toJSON()).toMatchSnapshot();
    });

    it("returns renderable React component with expected root class", () => {
      load(markdownWithFrontmatter, { ...defaultContext, query: { mode: [Mode.REACT], react: { root: 'forReact' } } });
      const MarkdownComponent = loaded.react;
      const rendered = reactRenderer.create(<MarkdownComponent />);
      expect(rendered.toJSON()).toMatchSnapshot();
    });

    it("returns renderable React component with accepting child components through props", () => {
      load(markdownWithFrontmatterIncludingPascalChildComponent, { ...defaultContext, query: { mode: [Mode.REACT] } });
      const MarkdownComponent = loaded.react;
      const ChildComponent = () => <strong>I am a child</strong>
      const AnotherChild = ({ children }) => <i>{children}</i>
      const rendered = reactRenderer.create(<MarkdownComponent ChildComponent={ChildComponent} AnotherChild={AnotherChild} />);
      expect(rendered.toJSON()).toMatchSnapshot();
    });
  })
});
