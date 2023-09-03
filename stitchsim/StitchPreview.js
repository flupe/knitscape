import { ProcessModel } from "./ProcessModel";
import { Pattern } from "./Pattern";
import { YarnModel } from "./YarnModel";
import { yarnLinkForce } from "./YarnForce";
import * as d3 from "d3";

const ITERATIONS = 1;

// Number of stitches to add to the left and right of the pattern
// (need to do this because tuck / slip stitches can't be on the
// end of the row)
const X_PADDING = 1;

// Number of rows to add to the top and bottom of the pattern
// (will be drawn in a different transparent color)
const Y_PADDING = 4; //

// Distance vertically between CNs
const STITCH_HEIGHT = 14;

// Distance horizontally between CNs (will be half of the stitch width)
const HALF_STITCH_WIDTH = 14;

const OFFSET_X = 15; // Padding from the side of the viewbox
const SPREAD = 1;
const LINK_STRENGTH = 0.2;

const YARN_WIDTH = 6;

// The target link distance when the simulation is run
const H_DIST = 10; //
const V_DIST = 14;

export function renderPreview(pattern, yarnChanges, color) {
  let rightSide = true;
  const pat = new Pattern(pattern.pad(X_PADDING, Y_PADDING, 0));
  // const ops = pat.makeOpData();
  const testModel = new ProcessModel(pat);
  const yarnGraph = new YarnModel(testModel.cn);
  // const opColors = d3.scaleOrdinal(d3.schemePastel1);
  const svg = d3.select("#simulation");
  svg.attr(
    "viewBox",
    `${-HALF_STITCH_WIDTH} 0 ${HALF_STITCH_WIDTH * (pat.width + 2) * 2} ${
      STITCH_HEIGHT * pat.height
    }`
  );

  const yarns = yarnChanges.toReversed();

  function yarnColor(rowNum) {
    if (rowNum < Y_PADDING || rowNum >= pat.height - Y_PADDING)
      return "#00000055";
    return color[yarns[(rowNum - Y_PADDING) % yarns.length]];
  }

  function layoutNodes(yarnGraph) {
    // calculates the x,y values for the i,j

    yarnGraph.contactNodes.forEach((node, index) => {
      const i = index % yarnGraph.width;
      const j = (index - i) / yarnGraph.width;
      node.i = i;
      node.j = j;

      node.x = OFFSET_X + i * HALF_STITCH_WIDTH;
      node.y = (yarnGraph.height - j) * STITCH_HEIGHT;
    });

    return yarnGraph.contactNodes;
  }

  // Data for simulation
  // const operationContainer = svg.append("g").attr("class", "operations");

  const nodes = layoutNodes(yarnGraph);
  const yarnPath = yarnGraph.makeNice();
  const yarnPathLinks = yarnGraph.yarnPathToLinks(); //.reverse();

  const yarnsBehind = svg.append("g");
  const yarnsFront = svg.append("g");

  const backYarns = yarnsBehind
    .attr("stroke-width", YARN_WIDTH)
    .attr("stroke-linecap", "round")
    .selectAll()
    .data(yarnPathLinks)
    .join("path")
    .filter(function (d) {
      return !(d.linkType == "LHLL" || d.linkType == "FLFH");
    })
    .attr("data-link", (d) => d.linkType)
    .attr("fill", "none")
    .attr("stroke", (d) => yarnColor(d.row));

  const frontYarns = yarnsFront
    .attr("stroke-width", YARN_WIDTH)
    .attr("stroke-linecap", "round")
    .selectAll()
    .data(yarnPathLinks)
    .join("path")

    .filter(function (d) {
      return d.linkType == "LHLL" || d.linkType == "FLFH";
    })
    .attr("data-link", (d) => d.linkType)
    .attr("fill", "none")
    .attr("stroke", (d) => yarnColor(d.row));

  // const operations = operationContainer
  //   .selectAll()
  //   .data(ops)
  //   .join("polygon")
  //   .attr("fill", (d) => opColors(d.op))
  //   .attr("points", (d) =>
  //     d.cnIndices.reduce(
  //       (str, vertexID) => `${str} ${nodes[vertexID].x},${nodes[vertexID].y}`,
  //       ""
  //     )
  //   )
  //   .attr("opacity", 0.2);

  function unitNormal(prev, next, flip) {
    if (prev.index === next.index) return [0, 0];
    const x = prev.x - next.x;
    const y = prev.y - next.y;

    const mag = SPREAD * Math.sqrt(x ** 2 + y ** 2);

    if (flip) {
      return [-y / mag, x / mag];
    } else {
      return [y / mag, -x / mag];
    }
  }

  function updateNormals() {
    yarnPath[0].normal = unitNormal(
      nodes[yarnPath[0].cnIndex],
      nodes[yarnPath[1].cnIndex],
      true
    );
    for (let index = 1; index < yarnPath.length - 1; index++) {
      // console.log(yarnPath[index].row);
      let flip;
      if (yarnPath[index].cnType == "FH" || yarnPath[index].cnType == "LH") {
        // headnode
        if (yarnPath[index].row % 2 == 0) {
          // moving right
          flip = true;
        } else {
          // moving left
          flip = false;
        }
      } else {
        // legnode
        if (yarnPath[index].row % 2 == 0) {
          // moving right
          flip = false;
        } else {
          // moving left
          flip = true;
        }
      }

      yarnPath[index].normal = unitNormal(
        nodes[yarnPath[index - 1].cnIndex],
        nodes[yarnPath[index + 1].cnIndex],
        flip
      );
    }

    yarnPath.at(-1).normal = unitNormal(
      nodes[yarnPath.at(-2).cnIndex],
      nodes[yarnPath.at(-1).cnIndex],
      true
    );
  }

  const openYarnCurve = d3
    .line()
    .x((d) => nodes[d.cnIndex].x + (YARN_WIDTH / 2) * d.normal[0])
    .y((d) => nodes[d.cnIndex].y + (YARN_WIDTH / 2) * d.normal[1])
    .curve(d3.curveCatmullRomOpen);

  function yarnCurve(yarnLink) {
    const index = yarnLink.index;

    if (index == 0 || index > yarnPathLinks.length - 3) {
      // if is the first or last link, just draw a line
      return `M ${yarnLink.source.x} ${yarnLink.source.y} ${yarnLink.target.x} ${yarnLink.target.y}`;
    }

    const linkData = [
      yarnPath[index - 1],
      yarnPath[index],
      yarnPath[index + 1],
      yarnPath[index + 2],
    ];

    return openYarnCurve(linkData);
  }

  function draw() {
    updateNormals();
    frontYarns.attr("d", yarnCurve);
    backYarns.attr("d", yarnCurve);
    // operations.attr("points", (d) =>
    //   d.cnIndices.reduce(
    //     (str, vertexID) => `${str} ${nodes[vertexID].x},${nodes[vertexID].y}`,
    //     ""
    //   )
    // );
  }

  draw();
  viewRightSide();

  function clear() {
    svg.selectAll("*").remove();
  }

  function relax() {
    d3.forceSimulation(nodes)
      .force(
        "link",
        yarnLinkForce(yarnPathLinks)
          .strength(LINK_STRENGTH)
          .iterations(ITERATIONS)
          .distance((l) =>
            l.linkType == "LLFL" || l.linkType == "FHLH" ? H_DIST : V_DIST
          )
      )

      .on("tick", draw);
  }

  function viewRightSide() {
    yarnsBehind.attr("filter", "brightness(0.7)");
    yarnsFront.attr("filter", "none");

    svg.attr("transform", null);
  }

  function viewWrongSide() {
    yarnsFront.attr("filter", "brightness(0.7)");
    yarnsBehind.attr("filter", "none");

    // Mirrors the svg
    svg.attr("transform", "scale(-1,1)");
  }

  function flip() {
    // Reorders the front and back yarn groups and re-applies the filter
    rightSide = !rightSide;
    d3.select("g").raise();
    rightSide ? viewRightSide() : viewWrongSide();
  }
  return { clear, relax, flip };
}
