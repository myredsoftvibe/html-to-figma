import {
  Button,
  createMuiTheme,
  CssBaseline,
  Divider,
  FormControlLabel,
  IconButton,
  MuiThemeProvider,
  Switch,
  TextField,
  Tooltip,
  Typography,
  Select,
  MenuItem,
  withStyles,
  Tabs,
  Tab,
  Box,
  CircularProgress,
} from "@material-ui/core";
import green from "@material-ui/core/colors/green";
import * as fileType from "file-type";
import { action, computed, observable, when } from "mobx";
import { observer } from "mobx-react";
import * as pako from "pako";
import * as React from "react";
import * as ReactDOM from "react-dom";
import * as md5 from "spark-md5";
import * as traverse from "traverse";
import { arrayBufferToBase64 } from "../lib/functions/buffer-to-base64";
import { SafeComponent } from "./classes/safe-component";
import { settings } from "./constants/settings";
import { theme as themeVars } from "./constants/theme";
import { deepClone, fastClone } from "./functions/fast-clone";
import { transformWebpToPNG } from "./functions/encode-images";
import { traverseLayers } from "./functions/traverse-layers";
import "./ui.css";
import { IntlProvider, FormattedMessage } from "react-intl";
import { en, ru } from "./localize/i18n";
import { Loading } from "./components/loading";
import { CheckListContent } from "./constants/utils";
import * as amplitude from "./functions/track";
import { v4 as uuid } from "uuid";
import { useDev } from "./constants/use-dev";

// https://stackoverflow.com/a/46634877
type Writeable<T> = { -readonly [P in keyof T]: T[P] };

amplitude.initialize();

export interface ClientStorage {
  imageUrlsByHash?: { [hash: string]: string | null };
  userId?: string;
  openAiKey?: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
  style?: React.CSSProperties;
}

type Node = TextNode | RectangleNode;

const theme = createMuiTheme({
  typography: themeVars.typography,
  palette: {
    primary: { main: themeVars.colors.primary },
    secondary: green,
  },
  overrides: {
    MuiButtonBase: {
      root: {
        boxShadow: "none !important",
      },
    },
    MuiTooltip: {
      tooltip: {
        fontSize: 13,
        backgroundColor: "rgba(45, 45, 45, 0.95)",
        padding: "7px 11px",
      },
    },
  },
  props: {
    MuiButtonBase: {
      style: {
        boxShadow: "none !important",
      },
      // The properties to apply
      disableRipple: true, // No more ripple, on the whole application 💣!
    },
  },
});

const StyledButton = withStyles({
  root: {
    fontSize: "12px",
    padding: "8px",
    height: "30px",
    minHeight: "unset",
    display: "flex",
    justifyContent: "center",
  },
})(MenuItem);

const BASE64_MARKER = ";base64,";
function convertDataURIToBinary(dataURI: string) {
  const base64Index = dataURI.indexOf(BASE64_MARKER) + BASE64_MARKER.length;
  const base64 = dataURI.substring(base64Index);
  const raw = window.atob(base64);
  const rawLength = raw.length;
  const array = new Uint8Array(new ArrayBuffer(rawLength));

  for (let i = 0; i < rawLength; i++) {
    array[i] = raw.charCodeAt(i);
  }
  return array;
}

export function getImageFills(layer: Node) {
  const images =
    Array.isArray(layer.fills) &&
    layer.fills
      .filter(
        (item) =>
          item.type === "IMAGE" && item.visible !== false && item.opacity !== 0
      )
      .sort((a, b) => b.opacity - a.opacity);
  return images;
}

// TODO: CACHE!
// const imageCache: { [key: string]: Uint8Array | undefined } = {};
export async function processImages(layer: Node) {
  const images = getImageFills(layer);

  const convertToSvg = (value: string) => {
    (layer as any).type = "SVG";
    (layer as any).svg = value;
    if (typeof layer.fills !== "symbol") {
      layer.fills = layer.fills.filter((item) => item.type !== "IMAGE");
    }
  };
  if (!images) {
    return Promise.resolve([]);
  }

  type AugmentedImagePaint = Writeable<ImagePaint> & {
    intArr?: Uint8Array;
    url?: string;
  };

  return Promise.all(
    images.map(async (image: AugmentedImagePaint) => {
      try {
        if (!image || !image.url) {
          return;
        }

        const url = image.url;
        if (url.startsWith("data:")) {
          const type = url.split(/[:,;]/)[1];
          if (type.includes("svg")) {
            const svgValue = decodeURIComponent(url.split(",")[1]);
            convertToSvg(svgValue);
            return Promise.resolve();
          } else {
            if (url.includes(BASE64_MARKER)) {
              image.intArr = convertDataURIToBinary(url);
              delete image.url;
            } else {
              console.info("Found data url that could not be converted", url);
            }
            return;
          }
        }
        // Внешний URL — прокси закомментирован, пропускаем
        console.info("Skipping external image URL (no proxy):", url);
        return; // ← добавить это

        // const isSvg = url.endsWith(".svg");

        // // Proxy returned content through Builder so we can access cross origin for
        // // pulling in photos, etc
        // const res = await fetch(
        //   `${apiHost}/api/v1/proxy-api?url=${encodeURIComponent(url)}`
        // );

        // const contentType = res.headers.get("content-type");
        // if (isSvg || contentType?.includes("svg")) {
        //   const text = await res.text();
        //   convertToSvg(text);
        // } else {
        //   const arrayBuffer = await res.arrayBuffer();
        //   const type = fileType(arrayBuffer);
        //   if (type && (type.ext.includes("svg") || type.mime.includes("svg"))) {
        //     convertToSvg(await res.text());
        //     return;
        //   } else {
        //     const intArr = new Uint8Array(arrayBuffer);
        //     delete image.url;

        //     if (
        //       type &&
        //       (type.ext.includes("webp") || type.mime.includes("image/webp"))
        //     ) {
        //       const pngArr = await transformWebpToPNG(intArr);
        //       image.intArr = pngArr;
        //     } else {
        //       image.intArr = intArr;
        //     }
        //   }
        // }
      } catch (err) {
        console.warn("Could not fetch image", layer, err);
      }
    })
  );
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index } = props;

  return value === index ? (
    <div
      style={{
        flexGrow: 1,
        ...props.style,
      }}
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
    >
      {value === index && children}
    </div>
  ) : null;
}

@observer
class App extends SafeComponent {
  editorRef: HTMLIFrameElement | null = null;

  @observable loading = false;
  @observable loadingCmsData = false;

  @observable lipsum = false;
  @observable loadingGenerate = false;
  @observable clientStorage: ClientStorage | null = null;
  @observable errorMessage = "";

  @observable generatingCode = false;
  @observable width = "1200";
  @observable online = navigator.onLine;
  @observable useFrames = false;
  @observable inDevMode: boolean = false;
  @observable devModeClickCount: number = 0;
  @observable showMoreOptions = true;
  @observable selection: (BaseNode & { data?: { [key: string]: any } })[] = [];
  @observable.ref selectionWithImages:
    | (BaseNode & {
        data?: { [key: string]: any };
      })[]
    | null = null;

  @observable commandKeyDown = false;
  @observable shiftKeyDown = false;
  @observable altKeyDown = false;
  @observable ctrlKeyDown = false;
  @observable showRequestFailedError = false;
  @observable showImportInvalidError = false;
  @observable isValidImport: null | boolean = null;
  @observable.ref previewData: any;
  @observable displayFiddleUrl = "";
  @observable currentLanguage = "en";
  @observable tabIndex = 0;
  @observable showDevModeOption: boolean = false;
  @observable figmaCheckList: {
    results?: CheckListContent[];
  } = {};
  @observable loaderContent: CheckListContent[] = [
    {
      id: "1a",
      data: {
        type: "during",
        textContent:
          "Getting everything ready... This can take a few minutes to complete.",
      },
    },
  ];

  editorScriptAdded = false;
  dataToPost: any;


  async updateStorage() {
    await when(() => !!this.clientStorage);
    parent.postMessage(
      {
        pluginMessage: {
          type: "setStorage",
          data: fastClone(this.clientStorage),
        },
      },
      "*"
    );
  }

  form: HTMLFormElement | null = null;
  urlInputRef: HTMLInputElement | null = null;
  iframeRef: HTMLIFrameElement | null = null;

  @observable initialized = false;


// Инициализирует плагин при монтировании компонента.
// Отправляет init и getStorage в code.ts, слушает ответные сообщения от Figma.
// Также отслеживает состояние storage и онлайн/офлайн статус.
  componentDidMount() {
    window.addEventListener("message", (e) => {
      const { data: rawData } = e as MessageEvent;

      this.initialized = true;

      const data = rawData.pluginMessage;
      if (!data) {
        return;
      }

      if (data.type === "doneLoading") {
        this.loading = false;
      }
      if (data.type === "storage") {
        this.clientStorage = data.data;
      }
    });

    parent.postMessage(
      {
        pluginMessage: {
          type: "getStorage",
        },
      },
      "*"
    );
    parent.postMessage(
      {
        pluginMessage: {
          type: "init",
        },
      },
      "*"
    );

    this.safeListenToEvent(window, "offline", () => (this.online = false));

    this.safeListenToEvent(window, "online", () => (this.online = true));

    this.safeReaction(
      () => this.clientStorage && fastClone(this.clientStorage),
      () => {
        if (this.clientStorage) {
          this.updateStorage();
        } else if (this.clientStorage === undefined) {
          this.clientStorage = { userId: uuid() };
        }
      }
    );

    this.safeReaction(
      () => this.clientStorage?.userId,
      (userId) => {
        if (userId) {
          amplitude.setUserId(userId);
          amplitude.track("figma plugin started");
        }
      }
    );
  }

  getLang() {
    return this.currentLanguage === "en" ? en : ru;
  }

  switchTab = (event: any, newValue: number) => {
    this.tabIndex = newValue;
  };

  render() {
    return (
      <IntlProvider
        messages={this.currentLanguage === "en" ? en : ru}
        locale={this.currentLanguage}
        defaultLocale="en"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            overflow: "auto",
            alignItems: "stretch",
            height: "100%",
          }}
        >
          {/* <Tabs
            variant="fullWidth"
            style={{
              minHeight: 40,
              backgroundColor: "#F9F9F9",
              flexShrink: 0,
              width: settings.ui.baseWidth,
              borderRight: "1px solid #ccc",
            }}
            TabIndicatorProps={{
              style: { transition: "none" },
            }}
            value={this.tabIndex}
            onChange={this.switchTab}
            indicatorColor="primary"
            textColor="primary"
          >
            <Tab
              style={{
                minHeight: 40,
                minWidth: 0,
              }}
              label={
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: "bold",
                    textTransform: "none",
                  }}
                >
                  Html to Figma
                </span>
              }
            />
          </Tabs> */}
          {/* <Divider style={{ width: settings.ui.baseWidth }} /> */}


          {/* Import to Figma */}
          {/* <TabPanel value={this.tabIndex} index={0}> */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                position: "relative",
                zIndex: 3,
                maxWidth: settings.ui.baseWidth,
                fontWeight: 400,
                marginBottom: 10,
                padding: 5,
              }}
            >
                {this.errorMessage && (
                  <div
                    style={{
                      color: "#721c24",
                      backgroundColor: "#f8d7da",
                      border: "1px solid #f5c6cb",
                      borderRadius: 4,
                      padding: ".75rem 1.25rem",
                      marginTop: 20,
                    }}
                  >
                    {this.errorMessage}
                  </div>
                )}
                {!this.online && (
                  <div
                    style={{
                      color: "#721c24",
                      backgroundColor: "#f8d7da",
                      border: "1px solid #f5c6cb",
                      borderRadius: 4,
                      padding: ".75rem 1.25rem",
                      marginTop: 20,
                    }}
                  >
                    <FormattedMessage
                      id="needOnline"
                      defaultMessage="You need to be online to use this plugin"
                    />
                  </div>
                )}
                {this.loading ? (
                  <div style={{ margin: 10 }}>
                    <Box
                      style={{
                        padding: 5,
                        backgroundColor: "#F9F9F9",
                        borderRadius: 4,
                        border: "1px solid #D3D3D3",
                        marginBottom: 10,
                      }}
                    >
                      <p style={{ margin: 2, fontSize: 12, opacity: 0.8 }}>
                        <span style={{ fontWeight: "bold" }}>
                          Note: this plugin is not magic.
                        </span>{" "}
                        For best results, you may need to do some cleanup
                        afterwards to make it production-ready.
                      </p>
                    </Box>

                    <Loading content={this.loaderContent} />
                  </div>
                ) : (
                  <>
                    {/* <Divider
                      style={{
                        margin: "0 -5",
                        maxWidth: settings.ui.baseWidth,
                      }}
                    /> */}
                    <div
                      style={{
                        padding: 15,
                        margin: "5 -5 -5",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: "bold",
                        }}
                      >
                        <FormattedMessage
                          id="chromeExtension"
                          defaultMessage="Chrome Extension"
                        />
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                        }}
                      >
                        <p
                          style={{
                            margin: "10 0",
                            opacity: 0.8,
                          }}
                        >
                          Want to capture a page that you need to navigate to or
                          is behind an auth wall? Then the Chrome Extension is
                          for you!
                        </p>

                        <p style={{ margin: "5 0" }}>
                          <span style={{ fontWeight: "bold" }}>Step 1: </span>
                          Use our
                          <a
                            style={{
                              color: themeVars.colors.primary,
                              cursor: "pointer",
                              textDecoration: "none",
                            }}
                            href="https://chrome.google.com/webstore/detail/efjcmgblfpkhbjpkpopkgeomfkokpaim"
                            target="_blank"
                          >
                            <FormattedMessage
                              id="chromeExtensionLink"
                              defaultMessage="chrome extension"
                            />
                          </a>
                        </p>

                        <p style={{ margin: "5 0" }}>
                          <span style={{ fontWeight: "bold" }}>Step 2: </span>
                          Upload the figma.json file
                          <a
                            onClick={() => {
                              const input = document.createElement("input");

                              input.type = "file";
                              document.body.appendChild(input);
                              input.style.visibility = "hidden";
                              input.click();

                              const onFocus = () => {
                                setTimeout(() => {
                                  if (
                                    input.parentElement &&
                                    (!input.files || input.files.length === 0)
                                  ) {
                                    done();
                                  }
                                }, 200);
                              };

                              const done = () => {
                                input.remove();
                                this.loading = false;
                                window.removeEventListener("focus", onFocus);
                              };

                              window.addEventListener("focus", onFocus);

                              // TODO: parse and upload images!
                              input.addEventListener("change", (event) => {
                                const file = (event.target as HTMLInputElement)
                                  .files![0];
                                if (file) {
                                  this.loading = true;
                                  var reader = new FileReader();

                                  // Closure to capture the file information.
                                  reader.onload = (e) => {
                                    const text = (e.target as any).result;
                                    try {
                                      const json = JSON.parse(text);
                                      Promise.all(
                                        json.layers.map(
                                          async (rootLayer: Node) => {
                                            await traverseLayers(
                                              rootLayer,
                                              (layer: any) => {
                                                if (getImageFills(layer)) {
                                                  return processImages(
                                                    layer
                                                  ).catch((err) => {
                                                    console.warn(
                                                      "Could not process image",
                                                      err
                                                    );
                                                  });
                                                }
                                              }
                                            );
                                          }
                                        )
                                      )
                                        .then(() => {
                                          parent.postMessage(
                                            {
                                              pluginMessage: {
                                                type: "import",
                                                data: json,
                                              },
                                            },
                                            "*"
                                          );
                                          amplitude.incrementUserProps(
                                            "import_count"
                                          );
                                          amplitude.track("import to figma", {
                                            type: "chrome-extension",
                                          });

                                          setTimeout(() => {
                                            done();
                                          }, 1000);
                                        })
                                        .catch((err) => {
                                          done();
                                          console.error(err);
                                          alert(err);
                                        });
                                    } catch (err) {
                                      alert("File read error: " + err);
                                      done();
                                    }
                                  };

                                  reader.readAsText(file);
                                } else {
                                  done();
                                }
                              });
                            }}
                            style={{
                              color: themeVars.colors.primary,
                              cursor: "pointer",
                            }}
                          >
                            <FormattedMessage
                              id="uploadLink"
                              defaultMessage=" upload here "
                            />
                          </a>
                        </p>
                      </div>
                    </div>
                  </>
                )}
            </div>
          {/* </TabPanel> */}

          {/*  FOOTER*/}
          {/* <div
            style={{
              display: "flex",
              flexDirection: "column",
              backgroundColor: "#F9F9F9",
              width: settings.ui.baseWidth,
              borderRight: "1px solid #ccc",
              marginTop: "auto",
            }}
          >
            <Divider /> */}

            {useDev && (
              <div
                style={{
                  color: "rgba(255, 40, 40, 1)",
                  backgroundColor: "rgba(255, 0, 0, 0.1)",
                  padding: 10,
                  borderRadius: 5,
                  whiteSpace: "pre-wrap",
                  margin: "10px 10px 0 10px",
                  textAlign: "center",
                }}
              >
                Using dev env. If you see this and you are not a developer,
                please report it
                {/* {" "} */}
                {/* <a
                  style={{ color: "inherit" }}
                  href="https://github.com/BuilderIO/html-to-figma/issues"
                  target="_blank"
                >
                  report it
                </a> */}
              </div>
            )}

          {/*  SUPPORT FOOTER*/}
            {/* <div
              style={{
                textAlign: "center",
                display: "flex",
                alignItems: "center",
                fontWeight: 500,
                fontSize: 12,
                padding: 10,
                gap: 10,
                margin: "0 auto 5px",
              }}
            >
              <a
                style={{
                  color: "#000000",
                  opacity: 0.7,
                  textDecoration: "none",
                }}
                href="https://github.com/BuilderIO/html-to-figma/issues"
                target="_blank"
              >
                <FormattedMessage
                  id="feedbackFooter"
                  defaultMessage="Feedback"
                />
              </a>
              <a
                style={{
                  color: "#000000",
                  opacity: 0.7,
                  textDecoration: "none",
                  marginLeft: 5,
                }}
                href="https://github.com/BuilderIO/html-to-figma"
                target="_blank"
              >
                <FormattedMessage id="source" defaultMessage="Source" />
              </a>
              <a
                style={{
                  color: "#000000",
                  opacity: 0.7,
                  textDecoration: "none",
                  marginLeft: 5,
                }}
                href="https://github.com/BuilderIO/html-to-figma"
                target="_blank"
              >
                <FormattedMessage id="help" defaultMessage="Help" />
              </a>
            </div> */}

            
          {/* </div> */}
        </div>
      </IntlProvider>
    );
  }
  handleDevModeClick(): void {
    this.devModeClickCount++;
    if (this.devModeClickCount > 4) {
      this.showDevModeOption = true;
    }
  }
}

ReactDOM.render(
  <MuiThemeProvider theme={theme}>
    <>
      <CssBaseline />
      <App />
    </>
  </MuiThemeProvider>,
  document.getElementById("react-page")
);
