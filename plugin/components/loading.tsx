import * as React from "react";
import "./loading.css";
import { Box } from "@material-ui/core";

export function Loading() {
  return (
    // <Box
    //   border={1}
    //   style={{
    //     padding: 15,
    //     backgroundColor: "#F4F8FF",
    //     borderRadius: 4,
    //     borderColor: "#F4F8FF",
    //     marginTop: 10,
    //   }}
    // >
      <div
        style={{
          height: 75,
          width: 75,
          borderRadius: 150,
          position: "relative",
          margin: "auto",
        }}
      >
        <div className="loader" />
      </div>
    // </Box>
  );
}