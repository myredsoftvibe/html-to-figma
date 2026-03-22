import * as amplitude from "@amplitude/analytics-browser";

// export const initialize = () =>
//   amplitude.init("cef436f480b80001e09b06b6da3d3db5");

// export const track = (eventInput: string, eventProperties = {} as any) =>
//   amplitude.track(eventInput, eventProperties);

// export const incrementUserProps = (eventName: string) => {
//   const identifyObj = new amplitude.Identify();
//   identifyObj.add(eventName, 1);
//   amplitude.identify(identifyObj);
// };

// export const setUserId = (userId: string) => amplitude.setUserId(userId);

// Stub for amplitude tracking — disabled for now
export const initialize = () => {};
export const track = (event: string, props?: any) => {};
export const setUserId = (id: string) => {};
export const incrementUserProps = (prop: string) => {};