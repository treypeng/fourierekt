
const BITTREX_PROXY = "http://localhost:3000/";
const CHART_WIDTH = 960, CHART_HEIGHT= 600;
const BAR_WIDTH = 3, BAR_PADDING = 4;
const BAR_FOOTPRINT = BAR_WIDTH + BAR_PADDING;

const MAX_DISPLAY_BARS = (CHART_WIDTH / BAR_FOOTPRINT)>>0;

const COLOURS = {
  candle: ['red', 'green'],
  wick: ['#a0a0a0', '#a0a0a0'],
  past: 'white',
  future: 'blue'
};

var tbPair = document.getElementById("inputPair");
var tbInterval = document.getElementById("inputInterval");
var btnExtrap = document.getElementById("btnExtrap");

var c = document.getElementById("chart");
var price_div = document.getElementById("prices");

c.width = CHART_WIDTH;
c.height = CHART_HEIGHT;
// 1:1 match these - no display scaling
c.style.width = `${CHART_WIDTH}px`;
c.style.height = `${CHART_HEIGHT}px`;

var ctx = c.getContext("2d");

var pair = "USDT-BTC";
var exchange = "BITTREX"

// For every rendered screen column there is at least one price
// record that data during rendering so mousemove can display the price
var x_prices = [];
var first_column_time = null;

const INTERVALS = [
  ["oneMin", '1m', 1000 * 60],  // interval in miliseconds needed for projected bar time
  ["fiveMin", '5m', 1000 * 60 * 5],
  ["fiveMin", '15m', 1000 * 60 * 15, true], // emulate 15 min
  ["thirtyMin", '30m', 1000 * 60 * 30],
  ["hour", '1H', 1000 * 60 * 60],
  ["day", '1D', 1000 * 60 * 60 * 24],
];

var which_interval = 1;
var interval = INTERVALS[which_interval];
var url = `${BITTREX_PROXY}?marketName=${pair}&tickInterval=${interval[0]}&_=${Date.now()}`
var fourier;

do_extrapolation();


btnExtrap.onclick = function()
{
  do_extrapolation();
}


function do_extrapolation()
{
  fourier = new Fourier();
  which_interval = Number(tbInterval.value);
  interval = INTERVALS[which_interval];
  pair = tbPair.value.toUpperCase();

  url = `${BITTREX_PROXY}?marketName=${pair}&tickInterval=${interval[0]}&_=${Date.now()}`

  clear_canvas();

  console.info("Proxying to BITTREX...");

  fetch(url).then(function(response) {
      console.info("OK");
      var contentType = response.headers.get("content-type");
      if(contentType && contentType.includes("application/json")) {
        return response.json();
      }
      throw new TypeError("Invalid data - bad pair?");
    })
    .then(function(json) {
      if (interval[3] == true)
      {
        // Bittrex API does not provide 15m interval, so emulate it with three 5m candles
        console.warn("Warning: using interval emulation");

        var emu_result = [];
        for (var t=0; t<json.result.length; t+=3)
        {
          if (t+2 > json.result.length-1) break;
          var candles = [
            json.result[t],
            json.result[t+1],
            json.result[t+2],
          ];

          var i15_time = candles[0].T;
          var i15_high = Math.max(Math.max(candles[0].H, candles[1].H), candles[2].H);
          var i15_low = Math.min(Math.min(candles[0].L, candles[1].L), candles[2].L);
          var i15_open = candles[0].O;
          var i15_close = candles[2].C;
          var i15_volume = candles[0].V + candles[1].V + candles[2].V;

          emu_result.push({
            BV: candles[0].BV, // not sure what this is
            C: i15_close,
            H: i15_high,
            L: i15_low,
            O: i15_open,
            T: i15_time,
            V: i15_volume
          });

        }
        json.result = emu_result;
      }

      render(json);
    });
}


function render(r)
{
  // clear price lookup table
  x_prices = [];

  // which bar to render from left edge of the chart window onwards
  var offset = (MAX_DISPLAY_BARS/2)>>0;

  // how many bars to render on screen
  var numbars = MAX_DISPLAY_BARS;

  // `bars` is the complete dataset for this interval
  var bars = r.result.reverse();

  // console.log(r.result[0]);
  // console.log(r.result[r.result.length-1]);

  // use crystal ball
  var res = fourier.extrapolate(bars);

  var fut = res.future.data.filter(function(e,i){
    return (i&1);
  });

  res.future.data = fut;

  var end = Math.max(offset - (numbars-1), 0);

  var bars_to_draw = [];

  // Extract the displayable bars from the full dataset
  for (var t=offset; t>=end; t--)
    bars_to_draw.push(bars[t]);

  // Find windowed price range for auto scaling
  var range = [ Math.min.apply(Math,bars_to_draw.map(function(o){return o.L;})),
                  Math.max.apply(Math,bars_to_draw.map(function(o){return o.H;}))];


  // extend logical scale factor to include fourier projection
  range = extend_range(offset, res, range);

  clear_canvas();

  draw_chart(bars_to_draw, range);
  draw_fourier(offset, res, range);

//  console.log(x_prices)

  ctx.globalAlpha = 0.7;
  ctx.fillStyle = "black";
  ctx.fillRect(5,5,110,55);
  ctx.globalAlpha = 1.0;

  ctx.font = "14px Courier";
  ctx.fillStyle = 'yellow';
  ctx.fillText(`${pair}`,10,20);
  ctx.fillStyle = 'white';
  ctx.fillText(`${exchange}, ${interval[1]}`,10,40);

}

function clear_canvas()
{
  ctx.fillStyle = "black";
  ctx.lineWidth = 1;
  ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
}

function extend_range(screen_column_latest, f, range)
{
  var newrange = [range[0], range[1]];

  for (var t=0; t<f.past.data.length; t++)
  {
    var column_x = (((screen_column_latest - t) + f.past.offset) * BAR_FOOTPRINT)>>0;
    if (column_x < 0) break;
    newrange[0] = Math.min(f.past.data[t], newrange[0]);
    newrange[1] = Math.max(f.past.data[t], newrange[1]);
    // save prices for mouseover
    for (var xp=column_x; xp<=column_x + BAR_FOOTPRINT-1; xp++)
      x_prices[xp] = { O: f.past.data[t], C: null, H: null, L: null };
  }

  // console.log("future leng", f.future.data.length);
//var start_offs = ((screen_column_latest + f.future.offset) * BAR_FOOTPRINT)>>0;
  for (var t=0; t<f.future.data.length; t++)
  {
    // var column_x = (start_offs + (t * BAR_FOOTPRINT))>>0;
    var column_x = (((screen_column_latest + t) + f.future.offset) * BAR_FOOTPRINT)>>0;
    if (column_x > CHART_WIDTH) break;
    newrange[0] = Math.min(f.future.data[t], newrange[0]);
    newrange[1] = Math.max(f.future.data[t], newrange[1]);

    // save prices for mouseover
    for (var xp=column_x; xp<=column_x + BAR_FOOTPRINT-1; xp++)
      x_prices[xp] = { O: f.future.data[t], C: null, H: null, L: null };
  }
  return newrange;
}


function draw_fourier(screen_column_latest, f, range)
{
  // Scan left, draw from 'now'ish (screen_column_latest - offset) into the past
  // moving forward through past.data[]
  var past_coords = [];
  for (var t=0; t<f.past.data.length; t++)
  {
    var column_x = (((screen_column_latest - t) + f.past.offset) * BAR_FOOTPRINT)>>0;
    if (column_x < 0) break;// {console.log(t, column, "BREAK"); break;}
    var price_y = ((1 - c_logical(f.past.data[t], range)) * CHART_HEIGHT)>>0;
    // console.log(column, price_y);
    past_coords.push([column_x, price_y]);
  }

  var future_coords = [];

  // var start_offs = ((screen_column_latest + f.future.offset) * BAR_FOOTPRINT)>>0;
  for (var t=0; t<f.future.data.length; t++)
  {
    var column_x = (((screen_column_latest + t) + f.future.offset) * BAR_FOOTPRINT)>>0;
    // /var column_x = (start_offs + (t * start_offs))>>0;
    if (column_x > CHART_WIDTH) break;
    var price_y = ((1 - c_logical(f.future.data[t], range)) * CHART_HEIGHT)>>0;
    future_coords.push([column_x, price_y]);
  }

  ctx.lineWidth = 4;

  for (var t=0; t<past_coords.length-1; t++)
  {
    var p1 = past_coords[t];
    var p2 = past_coords[t+1];

    ctx.strokeStyle = COLOURS.past;
    ctx.beginPath();
    ctx.moveTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.stroke();

  }

  for (var t=0; t<future_coords.length-1; t++)
  {
    var p1 = future_coords[t];
    var p2 = future_coords[t+1];

    ctx.strokeStyle = COLOURS.future;
    ctx.beginPath();
    ctx.moveTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.stroke();

  }

}

function draw_chart(output, range)
{
  ctx.lineWidth = 1;

  first_column_time = Date.parse(output[0].T + "Z"); // force UTC, get miliseconds

  for (var t=0; t<output.length; t++)
  {
    var c = output[t];
    var candle = {
      O: c_screen(c_logical(c.O, range)),
      C: c_screen(c_logical(c.C, range)),
      H: c_screen(c_logical(c.H, range)),
      L: c_screen(c_logical(c.L, range)),
    };
    draw_candle(candle, t);

    // Store prices by screen column
    var x = (t * BAR_FOOTPRINT)>>0;
    for (var xp=x; xp<=x + BAR_FOOTPRINT-1; xp++)
      x_prices[xp] = { O: c.O, C: c.C, H: c.H, L: c.L, T: new Date(Date.parse(c.T))};
  }

}

function draw_candle(candle, position)
{
  var x = (position * BAR_FOOTPRINT)>>0;

  var wick_top = candle.H;
  var wick_bottom = candle.L;
  var body_top = candle.O;
  var body_bottom = candle.C;

  if (body_top < body_bottom) //upside down, remember
  {
    // console.log("body swap!");
    var temp = body_top;
    body_top = body_bottom;
    body_bottom = temp;
  }

  var wc = 0;

  // Is our close greater than our open? Oh snap make it red then
  wc = (candle.C > candle.O) ? 0 : 1;

  ctx.strokeStyle = COLOURS.wick[wc];
  ctx.beginPath();
  ctx.moveTo(x + 2,wick_top);
  ctx.lineTo(x + 2,wick_bottom);
  ctx.stroke();

  ctx.fillStyle = COLOURS.candle[wc];
  ctx.fillRect(x, body_top, BAR_WIDTH+1, body_bottom - body_top);

}


c.onmousemove = function(e) {
  var m = getMousePos(this, e);
  var p = x_prices[m[0]];
  if (!p) return;

  var o = p.O ? p.O.toFixed(8) : '----------';
  var c = p.C ? p.C.toFixed(8) : '----------';
  var h = p.H ? p.H.toFixed(8) : '----------';
  var l = p.L ? p.L.toFixed(8) : '----------';

  // var o = p.O || '--';
  // var c = p.C || '--';
  // var h = p.H || '--';
  // var l = p.L || '--';
  //
  // o = o.toFixed(8); // fix predicted prices d.p.
  // c = c.toFixed(8);
  // h = h.toFixed(8);
  // l = l.toFixed(8);

  // which bar are we hovering over?
  var bar = (m[0] - (m[0] % BAR_FOOTPRINT)) / BAR_FOOTPRINT;

  var s = `Open: ${o}, Close: ${c}, High: ${h}, Low: ${l}`;
  // s += `<br>Time: ${p.T.toGMTString()}`

  var inter = INTERVALS[which_interval];

  var bar_time = new Date(first_column_time + (bar * inter[2]));
  // var starttime = new Date(first_column_time);

  var time_style="color: #808080; font-size: 12px";

  s +=`<br> <span style="${time_style}">Local time: ${bar_time.toLocaleString()}</span>`;

  price_div.innerHTML = s;

};

function getMousePos(canvas, evt) {
  var rect = canvas.getBoundingClientRect();
  return [evt.clientX - rect.left, evt.clientY - rect.top];
}




// convert logical 0..1 coordinates into screen pixel
function c_screen(logical)
{
  // '1 -' because computer display coords are upside down ^_^
  return ((1 - logical) * CHART_HEIGHT)>>0;
}

// convert a price in a defined range to a logical coordinate
function c_logical(price, range)
{
  return (price - range[0]) / (range[1] - range[0]);
}
