(function (source) {
    var tags = {},
        variables = {},
        variables_named = {},
        triggers = {},
        folders = {};

    var nodes = [],
        links = [];

    function search_gtm_variable(obj, result) {
        result = result || [];
        for (var p in obj) {
            if (obj.hasOwnProperty(p)) {
                if (Array.isArray(obj[p])) {
                    obj[p].forEach(function (v) {
                        search_gtm_variable(v, result);
                    });
                }
                if (typeof obj[p] === 'object' && obj.p !== null) {
                    search_gtm_variable(obj[p], result);
                } else {
                    var m = obj[p].match(/\{\{(.+)\}\}/gi);
                    if (m) {
                        m.forEach(function (d) {
                            d = d.replace(/[{}]/g, '');
                            if (variables_named[d] && result.indexOf(variables_named[d].id) === -1) {
                                result.push(variables_named[d].id);
                            }
                        });
                    }
                }
            }
        }
        return result;
    }

    function gtm_data(src, type) {
        var result = {};
        src[type] && src[type].forEach(function (v) {
            var key = v[type + 'Id'];
            result[key] = {
                id: type + '-' + v.name,
                node: type,
                fingerprint: v.fingerprint,
                name: v.name,
                variables: [],
                triggers: []
            };
            if (v.type) {
                result[key]['type'] = v.type;
            }
            if (v.firingTriggerId && v.firingTriggerId.length) {
                v.firingTriggerId.forEach(function (t) {
                    if (triggers[t]) {
                        result[key]['triggers'].push(triggers[t].id);
                    }
                });
                // result[key]['triggers'] = v.firingTriggerId;
            }
            if (v.parentFolderId) {
                result[key]['folder'] = v.parentFolderId;
            }
            if (v.parameter) {
                result[key]['parameter'] = v.parameter;
            }
        });

        return result;
    }

    function prepare_data() {
        folders = gtm_data(source.containerVersion, 'folder');
        variables = gtm_data(source.containerVersion, 'variable');
        triggers = gtm_data(source.containerVersion, 'trigger');
        triggers['2147479553'] = {
            id: "trigger-All Pages",
            name: "All Pages",
            node: "trigger",
            triggers: [],
            type: "PAGEVIEW"
        };
        tags = gtm_data(source.containerVersion, 'tag');

        for (var v in variables) {
            variables_named[variables[v].name] = variables[v];
        }

        // console.log(folders, variables, triggers, tags);

        for (var tag in tags) {
            if (tags.hasOwnProperty(tag)) {
                tags[tag]['variables'] = search_gtm_variable(tags[tag]);
                nodes.push(tags[tag]);
            }
        }

        for (var trigger in triggers) {
            if (triggers.hasOwnProperty(trigger)) {
                triggers[trigger]['variables'] = search_gtm_variable(triggers[trigger]);
                nodes.push(triggers[trigger]);
            }
        }

        for (var variable in variables) {
            if (variables.hasOwnProperty(variable)) {
                variables[variable]['variables'] = search_gtm_variable(variables[variable]);
                nodes.push(variables[variable]);
            }
        }

        console.log(nodes);

        nodes.forEach(function (n) {
            if (n.variables.length) {
                n.variables.forEach(function (v) {
                    links.push({
                        source: n.id,
                        target: v,
                        value: 1
                    });
                });
            }
            if (n.triggers.length) {
                n.triggers.forEach(function (v) {
                    links.push({
                        source: n.id,
                        target: v,
                        value: 1
                    });
                });
            }
        });

        console.log(links);
    }

    function draw() {
        var svg = d3.select("body")
            .append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .call(d3.zoom()
                .scaleExtent([1 / 2, 4])
                .on("zoom", zoomed));

        var width = window.innerWidth,
            height = window.innerHeight;

        var color = d3.scaleOrdinal(d3.schemeCategory20);
        var k = Math.sqrt(nodes.length / (width * height));

        var simulation = d3.forceSimulation()
            .force("link", d3.forceLink().id(function (d) {
                return d.id;
            }))
            .force("charge", d3.forceManyBody())
            .force("center", d3.forceCenter(width / 2, height / 2));

        var link = svg.append("g")
            .attr("class", "links")
            .selectAll("line")
            .data(links)
            .enter().append("line")
            .attr("stroke-width", function (d) {
                return Math.sqrt(d.value);
            })
            .style("marker-end", "url(#suit)");

        var tooltip = d3.select("body")
            .append("div")
            .style("position", "absolute")
            .style("z-index", "10")
            .style("visibility", "hidden")
            .text("");

        var node = svg.append("g")
            .attr("class", "nodes")
            .selectAll("circle")
            .data(nodes)
            .enter().append("circle")
            .attr("r", 5)
            .attr("fill", function (d) {
                return color(d.node);
            })
            .on("mouseover", function (d) {
                var circle = d3.select(this);
                circle.attr("r", circle.attr("r") * 1 + 3);
                var data = circle.data()[0];
                tooltip.text(data.node + ": " + data.name);
                return tooltip.style("visibility", "visible");
            })
            .on("mousemove", function () {
                return tooltip.style("top", (event.pageY - 10) + "px").style("left", (event.pageX + 10) + "px");
            })
            .on("mouseout", function () {
                tooltip.text('');
                var circle = d3.select(this);
                circle.attr("r", circle.attr("r") * 1 - 3);
                return tooltip.style("visibility", "hidden");
            })
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended))
            .on('dblclick', connectedNodes);

        node.append("title")
            .text(function (d) {
                return d.id;
            });

        simulation
            .nodes(nodes)
            .on("tick", ticked);

        simulation.force("link")
            .links(links);

        function zoomed() {
            node.attr("transform", d3.event.transform);
            link.attr("transform", d3.event.transform);
        }


        //Toggle stores whether the highlighting is on
        var toggle = 0;
//Create an array logging what is connected to what
        var linkedByIndex = {};
        for (i = 0; i < nodes.length; i++) {
            linkedByIndex[i + "," + i] = 1;
        }
        links.forEach(function (d) {
            linkedByIndex[d.source.index + "," + d.target.index] = 1;
        });
//This function looks up whether a pair are neighbours
        function neighboring(a, b) {
            return linkedByIndex[a.index + "," + b.index];
        }

        function connectedNodes() {
            if (toggle == 0) {
                //Reduce the opacity of all but the neighbouring nodes
                d = d3.select(this).node().__data__;
                node.style("opacity", function (o) {
                    return neighboring(d, o) | neighboring(o, d) ? 1 : 0.1;
                });
                link.style("opacity", function (o) {
                    return d.index == o.source.index | d.index == o.target.index ? 1 : 0.1;
                });
                //Reduce the op
                toggle = 1;
            } else {
                //Put them back to opacity=1
                node.style("opacity", 1);
                link.style("opacity", 1);
                toggle = 0;
            }
        }


        function ticked2() {
            link
                .attr("x1", function (d) {
                    var xPos = d.source.x;
                    if (xPos < 0) return 0;
                    if (xPos > (width)) return (width);
                    return xPos;
                })
                .attr("y1", function (d) {
                    var yPos = d.source.y;
                    if (yPos < 0) return 0;
                    if (yPos > (height)) return (height);
                    return yPos;
                })
                .attr("x2", function (d) {
                    var xPos = d.target.x;
                    if (xPos < 0) return 0;
                    if (xPos > (width)) return (width);
                    return xPos;
                })
                .attr("y2", function (d) {
                    var yPos = d.target.y;
                    if (yPos < 0) return 0;
                    if (yPos > (height)) return (height);
                    return yPos;
                });

            node
                .attr("cx", function (d) {
                    var xPos = d.x;
                    if (xPos < 0) return 0;
                    if (xPos > (width)) return (width);
                    return xPos;
                })
                .attr("cy", function (d) {
                    var yPos = d.y;
                    if (yPos < 0) return 0;
                    if (yPos > (height)) return (height);
                    return yPos;
                });
        }

        function ticked() {
            link
                .attr("x1", function (d) {
                    return d.source.x;
                })
                .attr("y1", function (d) {
                    return d.source.y;
                })
                .attr("x2", function (d) {
                    return d.target.x;
                })
                .attr("y2", function (d) {
                    return d.target.y;
                });

            node
                .attr("cx", function (d) {
                    return d.x;
                })
                .attr("cy", function (d) {
                    return d.y;
                });

        }

        function dragstarted(d) {
            if (!d3.event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(d) {
            d.fx = d3.event.x;
            d.fy = d3.event.y;
        }

        function dragended(d) {
            if (!d3.event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
    }

    function init() {
        prepare_data();

        draw();
    }


    init();

}(gtm_graph_data));
