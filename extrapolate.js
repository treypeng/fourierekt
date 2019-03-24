

function Fourier()
{
  this.lastBar = 30;
  this.pastBars = 300;
  this.futBars = 200;
  this.harmonics = 20;
  this.freqTol = 0.0001;
  this.pv = [];
  this.fv = [];

  this.getprice = function(bars, index)
  {
      //return bars[index].O;
      return (bars[index].O + bars[index].C) / 2;
      //return (bars[index].H + bars[index].L) / 2;
  };

  this.extrapolate = function(bars)
  {
    var np = this.pastBars;
    var lb = this.lastBar;
    var nf = this.futBars;
    var av = 0.0;

    for (var t=0; t<np; t++)
      av += this.getprice(bars, t + lb); //bars[t + lb].O;

    av /= np;

    // generate av carrier signal (maybe try EMA/MA ?)
    for (var t=0; t<np; t++)
    {
      this.pv[t] = av;
      if (t <= nf) this.fv[t] = av;
    }

    // compute frequency bands
    for (var harm=0; harm<this.harmonics; harm++)
    {
      var co = this.freq(bars);
      for (var t=0; t<np; t++) // modulate signal
      {
        this.pv[t] += co.m + co.c * Math.cos(co.w * t) + co.s * Math.sin(co.w * t);
        if (t <= nf)
          this.fv[t] += co.m + co.c * Math.cos(co.w * t) - co.s * Math.sin(co.w * t);
      }
    }
    return {
      past: {offset: -this.lastBar, data: this.pv},
      future: {offset: -this.lastBar, data: this.fv}
    };
  };

  this.freq = function(bars)
  {
    var z = [], num, den, a=0.0, b=2.0;
    var lb = this.lastBar, np = this.pastBars;
    z[0] = this.getprice(bars, lb) - this.pv[0];

    while(Math.abs(a-b) > this.freqTol)
    {
      a = b;
      z[1] = this.getprice(bars, 1 + lb) - this.pv[1] + a * z[0];
      num = z[0] * z[1];
      den = z[0] * z[0];

      for(var i=2; i<np; i++)
      {
        //z[i]=bars[i + lb].O - this.pv[i] + a * z[i - 1] - z[i - 2];
        z[i]=this.getprice(bars, i + lb) - this.pv[i] + a * z[i - 1] - z[i - 2];
        num += z[i - 1] * (z[i] + z[i - 2]);
        den += z[i - 1] * z[i - 1];
      }

      b = num/den;
    }

    return this.fit(Math.acos(b / 2.0), bars);
  };

  this.fit = function(w, bars)
  {
    var lb = this.lastBar, np = this.pastBars;
    var Sc=0.0, Ss=0.0,Scc=0.0,Sss=0.0;
    var Scs=0.0,Sx=0.0,Sxx=0.0,Sxc=0.0,Sxs=0.0;

    var m, c, s;

    for(var i=0;i<np;i++)
    {
       var cos=Math.cos(w * i);
       var sin=Math.sin(w * i);
       Sc+=cos;
       Ss+=sin;
       Scc+=cos*cos;
       Sss+=sin*sin;
       Scs+=cos*sin;
       // Sx+=(bars[i+lb].O - this.pv[i]);
       Sx+=(this.getprice(bars, i + lb) - this.pv[i]);
       //Sxx+=Math.pow(bars[i+lb].O - this.pv[i],2);
       Sxx+=Math.pow(this.getprice(bars,i+lb) - this.pv[i],2);
       //Sxc+=(bars[i+lb].O-this.pv[i])*cos;
       Sxc+=(this.getprice(bars, i+lb)-this.pv[i])*cos;
       //Sxs+=(bars[i+lb].O-this.pv[i])*sin;
       Sxs+=(this.getprice(bars, i +lb)-this.pv[i])*sin;
    }

    Sc/=np;
    Ss/=np;
    Scc/=np;
    Sss/=np;
    Scs/=np;
    Sx/=np;
    Sxx/=np;
    Sxc/=np;
    Sxs/=np;

    if(w==0.0)
    {
      m=Sx;
      c=0.0;
      s=0.0;
    } else {
      //calculating c, s, and m
      var den=Math.pow(Scs-Sc*Ss,2)-(Scc-Sc*Sc)*(Sss-Ss*Ss);
      c=((Sxs-Sx*Ss)*(Scs-Sc*Ss)-(Sxc-Sx*Sc)*(Sss-Ss*Ss))/den;
      s=((Sxc-Sx*Sc)*(Scs-Sc*Ss)-(Sxs-Sx*Ss)*(Scc-Sc*Sc))/den;
      m=Sx-c*Sc-s*Ss;
    }

    return {w: w, m: m, c: c, s: s};

  };


}
