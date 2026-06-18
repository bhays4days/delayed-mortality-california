//////////////////////////////////////////////////////////////////////////////////
//                                   Burn Perimeter                                            //
// // Print and display the Feature Collection from the CA state boundary and Fire Perimeter
// Stratification sampling by::
// Burned plots: represent the full range of fire effects → stratify by severity + elevation
// Unburned plots: represent background conditions matched to burned landscape → stratify by elevation + aspect
// Aspect on both: north vs south facing drives moisture and recovery differences strongly in CA forests

// For FP plots — stratify by severity × elevation:

// This captures both the fire effect gradient (your primary variable) and the climate/physiological gradient that modulates recovery
// 3 severity classes × 2-3 elevation classes = 6-9 strata per fire

// For BP plots — stratify by elevation × aspect:

// Elevation matches the climate gradient of your burned plots
// Aspect captures north/south moisture differences that drive background mortality rates
// No severity stratification since these plots are unburned

// ── 1. ROI ────────────────────────────────────────────────────────────────────
var CA = ee.FeatureCollection('TIGER/2016/States')
  .filter(ee.Filter.inList('NAME', ['California']));
Map.addLayer(CA, {}, 'ROI');
Map.centerObject(CA, 6);

// ── 2. FIRE FILTERING ─────────────────────────────────────────────────────────
var fires = ee.FeatureCollection('USFS/GTAC/MTBS/burned_area_boundaries/v1')
  .map(function(feature) {
    var num = ee.Number.parse(feature.get('BurnBndAc'));
    return feature.set('BurnBndAc', num);
  });

var BurnPerimeter = fires.filterBounds(CA);
print('Fire count in CA from 1984-2022:', BurnPerimeter.size());

var truncFires = BurnPerimeter
  .filter(ee.Filter.gte('Ig_Date', 946688401000))
  .filter(ee.Filter.lte('Ig_Date', 1420070341000));

var largeFires = truncFires.filter(ee.Filter.gte('BurnBndAc', 1000));
print('Fire count in CA from 2000-2014 >400 ha', largeFires.size());

var truncFiresClipped = truncFires.map(function(feature) {
  return feature.intersection(CA.geometry(), ee.ErrorMargin(1));
});
var largeFiresClipped = largeFires.map(function(feature) {
  return feature.intersection(CA.geometry(), ee.ErrorMargin(1));
});

// ── 3. VISUALIZE FIRES ────────────────────────────────────────────────────────
var Burnvis = {fillColor: 'ff8a50', color: 'ff5722', width: 2.0};
Map.addLayer(BurnPerimeter, {color: 'grey'}, 'All MTBS fires 1984-2022');
Map.addLayer(truncFiresClipped, {color: 'pink'}, 'Fires 2000-2014');
Map.addLayer(largeFiresClipped, Burnvis, 'Large fires >1ha 2000-14');
Map.setCenter(-123.32926811960047, 38.79459575883483, 8);

// ── 4. TREE COVER FILTER → validFires ────────────────────────────────────────
var hansen = ee.Image('UMD/hansen/global_forest_change_2023_v1_11');
var treeCover = hansen.select('treecover2000');

var firesWithTreeCover = largeFires.map(function(fire) {
  var avgCover = treeCover.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: fire.geometry(),
    scale: 30,
    maxPixels: 1e8
  }).get('treecover2000');
  return fire.set('avg_treecover', avgCover);
}).filter(ee.Filter.gte('avg_treecover', 49.6));

print('Fires with >49.6% tree cover:', firesWithTreeCover.size()); // 221

var validFires = firesWithTreeCover.map(function(fire) {
  var geom = fire.geometry();
  var newGeom = ee.Algorithms.If(
    ee.List(['Polygon', 'MultiPolygon']).contains(geom.type()),
    geom,
    geom.buffer(1)
  );
  return fire.setGeometry(ee.Geometry(newGeom));
});

// ── 5. HELPER FUNCTIONS ───────────────────────────────────────────────────────
var calculateScalingFactor = function(fireFeature) {
  var area = fireFeature.get('BurnBndAc');
  var numPoints = ee.Number(area).multiply(0.01).round();
  return numPoints.min(200).max(30);
};

var enforceMinDistance = function(points, minDist) {
  var joined = ee.Join.saveAll('neighbors').apply({
    primary: points,
    secondary: points,
    condition: ee.Filter.withinDistance({
      distance: minDist,
      leftField: '.geo',
      rightField: '.geo',
      maxError: 1
    })
  });
  return joined.map(function(f) {
    var nNeighbors = ee.List(f.get('neighbors')).size();
    return f.set('n_neighbors', nNeighbors);
  }).filter(ee.Filter.eq('n_neighbors', 1));
};

// ── 6. WATER MASK ─────────────────────────────────────────────────────────────
// JRC returns 0 for land AND no-data - need to handle no-data as land
var waterOccurrence = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
  .select('occurrence');

// Treat pixels with no data (unmapped) as land using unmask
var landMask = waterOccurrence
  .unmask(0)        // fill no-data with 0 (not water)
  .lt(50)           // < 50% water occurrence = land
  .rename('land');

// ── 7. STRATIFICATION LAYERS ──────────────────────────────────────────────────
var dem = ee.Image('USGS/SRTMGL1_003');
var elevation = dem.select('elevation');
var aspect = ee.Terrain.aspect(dem);

var elevClass = elevation
  .where(elevation.lt(1000), 1)
  .where(elevation.gte(1000).and(elevation.lt(2000)), 2)
  .where(elevation.gte(2000), 3)
  .rename('elev_class');

var aspectClass = aspect
  .where(aspect.lt(90).or(aspect.gte(270)), 1)   // North facing
  .where(aspect.gte(90).and(aspect.lt(270)), 2)   // South facing
  .rename('aspect_class');

var mtbsSeverity = ee.ImageCollection('USFS/GTAC/MTBS/annual_burn_severity_mosaics/v1');

// ── 8. STRATIFIED POINT GENERATION ───────────────────────────────────────────
var generateStratifiedPoints = function(fire) {
  var fireGeom = fire.geometry();
  var numPoints = calculateScalingFactor(fire);  // 30-200 based on fire size
  var donut = fireGeom.buffer(1000).difference(fireGeom.buffer(1));
  var igYear = ee.Date(ee.Number(fire.get('Ig_Date'))).get('year');

  // Get severity remapped to 1=Low, 2=Moderate, 3=High
  // MTBS: 1=Unburned/Low, 2=Low, 3=Moderate, 4=High, 5=Increased Greenness
  var severityImg = mtbsSeverity
    .filter(ee.Filter.calendarRange(igYear, igYear, 'year'))
    .filter(ee.Filter.stringContains('system:index', 'CONUS'))
    .filterBounds(fireGeom)
    .first()
    .select('Severity')
    .remap([1, 2, 3, 4, 5],
           [0, 1, 2, 3, 0])   // 0=exclude, 1=Low, 2=Moderate, 3=High
    .rename('severity_class')
    .selfMask();               // mask out 0s

  // ── FP: Composite severity x elevation strata ──────────────────────────────
  // severity(1-3) x 10 + elevation(1-3) = 11 (severity low, elevation low),12,13,21,22 (severity moderate, elevation moderate),23,31,32,33 (burn severity high, elevation high)
  var fpStratImage = severityImg
    .multiply(10)
    .add(elevClass)
    .toInt()                   // cast to integer - FIXES the error
    .rename('sev_elev_class')
    .updateMask(landMask)
    .clip(fireGeom);

  var fpPoints = fpStratImage.stratifiedSample({
    numPoints: 20,             // 20 plots per stratum x 9 strata = 180 max FP points
    classBand: 'sev_elev_class',
    region: fireGeom,
    scale: 30,
    seed: 42,
    geometries: true
    // No classValues - samples whatever strata are present
  });

  // ── BP: Composite elevation x aspect strata ────────────────────────────────
  // elevation(1-3) x 10 + aspect(1-2) = 11,12,21,22,31,32
  var bpStratImage = elevClass
    .multiply(10)
    .add(aspectClass)
    .toInt()                   // cast to integer - FIXES the error
    .rename('elev_asp_class')
    .updateMask(landMask)
    .clip(donut);

  var bpPoints = bpStratImage.stratifiedSample({
    numPoints: 30,             // 30 plots per stratum x 6 strata = 180 max BP points (accounts for ~30% loss)
    classBand: 'elev_asp_class',
    region: donut,
    scale: 30,
    seed: 42,
    geometries: true
  });

  // Add properties
  var igYearFormatted = ee.Date(ee.Number(fire.get('Ig_Date'))).format('YYYY-MM-dd');

  var fpWithProps = fpPoints.map(function(pt) {
    return pt.set({
      'Fire_ID': fire.get('Event_ID'),
      'Category': 'FP',
      'Fire_Name': fire.get('Incid_Name'),
      'num_points': numPoints,
      'Ig_Year': igYearFormatted
    });
  });

  var bpWithProps = bpPoints.map(function(pt) {
    return pt.set({
      'Fire_ID': fire.get('Event_ID'),
      'Category': 'BP',
      'Fire_Name': fire.get('Incid_Name'),
      'num_points': numPoints,
      'Ig_Year': igYearFormatted
    });
  });

  // Enforce 90m minimum distance
  // Use 90 as limit floor (not numPoints) to preserve stratification
  var fpFiltered = enforceMinDistance(fpWithProps, 90);
  var bpFiltered = enforceMinDistance(bpWithProps, 90);

  return fpFiltered.merge(bpFiltered);
};

// ── 9. FILTER TO WILDFIRES + TEST ─────────────────────────────────────────────
var wildfireOnly = validFires.filter(
  ee.Filter.or(
    ee.Filter.eq('Incid_Type', 'Wildfire'),
    ee.Filter.eq('Incid_Type', 'Wildland Fire Use')
  )
);
print('Wildfire count:', wildfireOnly.size());  // 202

var testFire = wildfireOnly.first();
print('Test fire name:', testFire.get('Incid_Name'));

var testPoints = generateStratifiedPoints(testFire);
print('Test total points:', testPoints.size());
print('FP points:', testPoints.filter(ee.Filter.eq('Category', 'FP')).size());
print('BP points:', testPoints.filter(ee.Filter.eq('Category', 'BP')).size());

var fpTest = testPoints.filter(ee.Filter.eq('Category', 'FP'));
var bpTest = testPoints.filter(ee.Filter.eq('Category', 'BP'));

// Composite class values: FP=sev*10+elev, BP=elev*10+aspect
print('FP sev_elev_class distribution:', fpTest.aggregate_histogram('sev_elev_class'));
print('BP elev_asp_class distribution:', bpTest.aggregate_histogram('elev_asp_class'));

Map.addLayer(fpTest, {color: 'red'}, 'FP Stratified');
Map.addLayer(bpTest, {color: 'blue'}, 'BP Stratified');
Map.centerObject(testFire.geometry(), 10);

// ── 10. FULL EXPORT ───────────────────────────────────────────────────────────
var allPoints = wildfireOnly.map(generateStratifiedPoints).flatten(); // Total:  33752 points
print('Total points all fires:', allPoints.size()); 
print('Total FP:', allPoints.filter(ee.Filter.eq('Category', 'FP')).size()); //  FP: 20 x 9 strata = 180 max/ fire (n=15087)
print('Total BP:', allPoints.filter(ee.Filter.eq('Category', 'BP')).size()); // BP: 30 x 6 strata = 180 max/fire (accounts for ~30% loss) (n=18665)

Export.table.toDrive({
  collection: allPoints,
  description: 'All_202_Wildfire_Plots_Stratified_90m',
  fileFormat: 'CSV',
  folder: 'EarthEngine',
  selectors: ['Fire_ID', 'num_points', 'Category', 'Fire_Name',
              'Ig_Year', 'sev_elev_class', 'elev_asp_class', '.geo']
});

// Focal fires + donuts
var focalFirePolygons = wildfireOnly.map(function(fire) {
  return ee.Feature(fire.geometry())
    .copyProperties(fire, ['Event_ID', 'Incid_Name', 'Ig_Date', 'BurnBndAc'])
    .set('type', 'fire_perimeter');
});

var focalDonutPolygons = wildfireOnly.map(function(fire) {
  var donut = fire.geometry().buffer(1000).difference(fire.geometry().buffer(1));
  return ee.Feature(donut)
    .copyProperties(fire, ['Event_ID', 'Incid_Name', 'Ig_Date', 'BurnBndAc'])
    .set('type', 'buffer_donut');
});

Export.table.toDrive({
  collection: focalFirePolygons.merge(focalDonutPolygons),
  description: 'Focal_Fires_And_Donuts_202',
  fileFormat: 'SHP',
  folder: 'EarthEngine',
  fileNamePrefix: 'Focal_Fires_And_Donuts_202'
});

//////////////////////////////////////////////////////////////////////////////////////////////////
// Specifically get the n= 195 Fires + Donuts and export as a SHP
// Get the 195 clean plot points asset to extract Fire_IDs
var cleanPlots = ee.FeatureCollection(
  'projects/britthays-uwyo/assets/Wildfire_Plots_Stratified_195'
);

// Extract the 195 unique Fire_IDs from the clean plots
var cleanFireIDs = cleanPlots.aggregate_array('Fire_ID').distinct();
print('Clean Fire IDs count:', cleanFireIDs.size());  // should be 195

// Filter wildfireOnly to only the 195 clean fires
var cleanFires = wildfireOnly.filter(
  ee.Filter.inList('Event_ID', cleanFireIDs)
);
print('Clean fires count:', cleanFires.size());  // should be 195

// Export fire polygons + donuts
var focalFirePolygons = cleanFires.map(function(fire) {
  return ee.Feature(fire.geometry())
    .copyProperties(fire, ['Event_ID', 'Incid_Name', 'Ig_Date', 'BurnBndAc'])
    .set('type', 'fire_perimeter');
});

var focalDonutPolygons = cleanFires.map(function(fire) {
  var donut = fire.geometry().buffer(1000).difference(fire.geometry().buffer(1));
  return ee.Feature(donut)
    .copyProperties(fire, ['Event_ID', 'Incid_Name', 'Ig_Date', 'BurnBndAc'])
    .set('type', 'buffer_donut');
});

Export.table.toDrive({
  collection: focalFirePolygons.merge(focalDonutPolygons),
  description: 'Focal_Fires_And_Donuts_195',
  fileFormat: 'SHP',
  folder: 'EarthEngine',
  fileNamePrefix: 'Focal_Fires_And_Donuts_195'
});

STOP

