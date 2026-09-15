////////////////////////////////////////////////////////////////////////////////////////////
// Raster extraction by point list                                                        //
// Code by: Britt Hays                                                            //
//                                                                                       //
// Load CA boundary from TIGER dataset
////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////
// Create feature collection for CA
var CA = ee.FeatureCollection('TIGER/2016/States')
                      .filter(ee.Filter.inList('NAME',['California']));
                      
// Visualize the Fire Perimeters
// Load MTBS Fires from 1984-2022.
var fires = ee.FeatureCollection('USFS/GTAC/MTBS/burned_area_boundaries/v1') //1984-01-01T00:00:00 - 2024-12-31T00:00:00
  // Convert 'BurnBndAc' property from string to number.
  .map(function(feature){
    var num = ee.Number.parse(feature.get('BurnBndAc'));
    return feature.set('BurnBndAc', num);
  });

// Filter MTBS fires to be only in the state of CA.
var CAPerimeter = fires.filterBounds(CA);

var states = ee.FeatureCollection("TIGER/2018/States");
var West = states.filter(ee.Filter.inList('NAME', ['California', 'Oregon', 'Arizona', 'Nevada']));
var region = West.geometry(); // unified geometry

var BurnPerimeter = fires.filterBounds(region);

// Filter by date eg., between 2000-01-01 and 2014-12-31 use: // https://www.epochconverter.com/
var truncFires = CAPerimeter.filter(ee.Filter.gte('Ig_Date', 946688401000))  // >= 2000-01-01 BurnPerimeter.filter
  .filter(ee.Filter.lte('Ig_Date', 1420070341000));  // <= 2014-12-31

// Check the number of fires filtered by date and size
// Filter by Date AND fire Size eg., >1,000acres == 400 ha
var cleanPlots = ee.FeatureCollection(
  'projects/britthays-uwyo/assets/Stratified_Wildfire_Plots_195'
);
var cleanFireIDs = cleanPlots.aggregate_array('Fire_ID').distinct();
var largeFires = truncFires
  .filter(ee.Filter.gte('BurnBndAc', 1000))
  .filter(ee.Filter.inList('Event_ID', cleanFireIDs));  // restrict to 195

print('Clean fire count:', largeFires.size());  // should be 195

// Vis Parameters
var Burnvis = {
  fillColor: 'ff8a50',
  color: 'ff5722', // orange
  width: 2.0,
};

// Visualize Fires by filters in order of least filtered to most filtered
Map.addLayer(BurnPerimeter, {color: 'black'}, 'All MTBS fires 1984-2024'); // use for checking intersections
Map.addLayer(largeFires, {color: 'orange'}, 'Fires 2000-2014'); // Use the largeFires of n=102 fires >17,000 acres

// Attempt to convert all geometries to Polygon or MultiPolygon
var cleanedBurnPerimeter = BurnPerimeter.map(function(feature) {
  var geom = feature.geometry();
  var type = geom.type();
  
  // If already Polygon or MultiPolygon, keep it
  var allowedTypes = ee.List(['Polygon', 'MultiPolygon']);
  var isAllowed = allowedTypes.contains(type);
  
  return ee.Feature(
    ee.Algorithms.If(
      isAllowed,
      feature, // keep as-is
      // Attempt to buffer and simplify to fix it
      feature.setGeometry(geom.buffer(1).buffer(-1)) // buffer-in & buffer-out to fix geometry
    )
  );
});

// After geometry fix, keep only valid polygon features
var exportPolygons_fixed = cleanedBurnPerimeter.map(function(feature) {
  var geomType = feature.geometry().type();
  var allowedTypes = ee.List(['Polygon', 'MultiPolygon']);
  var isPolygon = allowedTypes.contains(geomType);
  
  return ee.Feature(ee.Algorithms.If(isPolygon, feature, null));
}).filter(ee.Filter.notNull(['system:index']));

print('Filtered polygon count:', exportPolygons_fixed.size());
print('Raw polygon count:', BurnPerimeter.size());

Map.addLayer(exportPolygons_fixed, {color: 'orange'}, 'Polygons to Export'); // should match the grey polygons

// Export.table.toDrive({
//   collection: exportPolygons_fixed, // export the mtbs burns from 1984-2024 from OR, AZ, UT, CA
//   folder: 'EarthEngine',
//   fileFormat: 'SHP',
//   fileNamePrefix: 'MTBS_Fire_Polygons',
//   description: 'MTBS_Fire_Polygons'
// });

// Shape file: MTBS fires 2000-2014
// Export.table.toDrive({
//   collection: largeFires, // use the limit function to export partial data
//   folder: 'EarthEngine',
//   fileFormat: 'SHP',
//   fileNamePrefix: 'Fire_Polygons',
//   description: 'Fire_Polygons'
// });
// Download 

// ── 1. LOAD CLEAN 195 FIRE PLOTS ─────────────────────────────────────────────
var cleanPlots = ee.FeatureCollection(
  'projects/britthays-uwyo/assets/Stratified_Wildfire_Plots_195'
);

// Get 195 clean Fire_IDs
var cleanFireIDs = cleanPlots.aggregate_array('Fire_ID').distinct();
print('Unique fires in asset:', cleanFireIDs.size());  // should be 195

// Convert date format
var plotList = cleanPlots.map(function(feature) {
  var dateObject = ee.Date(feature.get('Ig_Year'));
  return feature.set('formatted_date', dateObject.format('YYYY-MM-dd'));
});

// ── 2. TWO VERSIONS OF PLOTS ──────────────────────────────────────────────────
// Use POINTS for: topography, burn severity, soil, categorical variables
var plotPoints = plotList;

// Use 56m BUFFERS for: NDVI, NBR, canopy cover, rangeland, climate
var plotBuffers = plotList.map(function(feature) {
  return ee.Feature(feature.geometry().buffer(56))
    .copyProperties(feature);
});

print('Point plots:', plotPoints.size());    // should be ~33,000
print('Buffer plots:', plotBuffers.size());  // should match

// ── 3. FILTER MTBS TO 195 FIRES ───────────────────────────────────────────────
var CA = ee.FeatureCollection('TIGER/2016/States')
  .filter(ee.Filter.inList('NAME', ['California']));

var fires = ee.FeatureCollection('USFS/GTAC/MTBS/burned_area_boundaries/v1')
  .map(function(f) {
    return f.set('BurnBndAc', ee.Number.parse(f.get('BurnBndAc')));
  });

var truncFires = fires
  .filterBounds(CA)
  .filter(ee.Filter.gte('Ig_Date', 946688401000))
  .filter(ee.Filter.lte('Ig_Date', 1420070341000));

var cleanFires = truncFires
  .filter(ee.Filter.gte('BurnBndAc', 1000))
  .filter(ee.Filter.inList('Event_ID', cleanFireIDs));

print('Clean fires:', cleanFires.size());  // should be 195

// Export.table.toDrive({
//   collection: plotBuffers,               // Your filtered FeatureCollection
//   description: 'Plot_Polygons_56m',     // Internal EE job name
//   folder: 'EarthEngine',                       // GDrive folder (create it if needed)
//   fileNamePrefix: 'Plot_Polygons_56m',         // Shapefile name
//   fileFormat: 'SHP'                            // save as EE Asett
// });

print(plotBuffers.limit(1), 'Buffer geometry check');

// Check the buffer on the map in the first 10 features
Map.addLayer(plotBuffers, {color: 'black'}, 'Point Buffers');
Map.addLayer(plotList,{color:'blue'},'Plots',true);

// Load CA boundary from TIGER dataset
// ============================================================
// CALIFORNIA EVT 2001 AREA + PERCENT OF CALIFORNIA
// ============================================================

// California boundary
var ca_boundary = ee.FeatureCollection('TIGER/2016/States')
  .filter(ee.Filter.eq('NAME', 'California'));

var ca_geom = ca_boundary.geometry();

// Load EVT 2001
var evt_2001 = ee.Image(
  'projects/britthays-uwyo/assets/EVT2001'
).select('b1');

// ------------------------------------------------------------
// Check projection and scale
// ------------------------------------------------------------

print('EVT image:', evt_2001);
print('EVT projection:', evt_2001.projection());
print('EVT nominal scale:', evt_2001.projection().nominalScale());
print('EVT band names:', evt_2001.bandNames());

// ------------------------------------------------------------
// Pixel area
// ------------------------------------------------------------

// pixelArea() = square meters
// Divide by 10,000 = hectares
var pixelAreaHa = ee.Image.pixelArea().divide(10000);

// ------------------------------------------------------------
// Calculate TOTAL California area
// ------------------------------------------------------------

var totalAreaDict = pixelAreaHa.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: ca_geom,
  crs: 'EPSG:5070',
  scale: 30,
  maxPixels: 1e13,
  tileScale: 4
});

var totalCAHa = ee.Number(totalAreaDict.get('area'));

var totalCAkm2 = totalCAHa.divide(100);

print('Total California area (ha):', totalCAHa);
print('Total California area (km2):', totalCAkm2);


// ============================================================
// FUNCTION TO CALCULATE EVT GROUP AREA
// ============================================================

function calcEVTArea(group_name, evt_codes) {

  // Build mask for all codes in this group
  var group_mask = evt_2001.eq(evt_codes[0]);

  for (var i = 1; i < evt_codes.length; i++) {
    group_mask = group_mask.or(
      evt_2001.eq(evt_codes[i])
    );
  }

  // Area image masked to this EVT group
  var groupArea = pixelAreaHa.updateMask(group_mask);

  // Sum area within California
  var areaDict = groupArea.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: ca_geom,
    crs: 'EPSG:5070',
    scale: 30,
    maxPixels: 1e13,
    tileScale: 4
  });

  var areaHa = ee.Number(
    areaDict.get('area')
  );

  var areaKm2 = areaHa.divide(100);

  // Percentage of California
  var percentCA = areaHa
    .divide(totalCAHa)
    .multiply(100);

  return ee.Feature(null, {
    'EVT_Group': group_name,
    'Area_ha': areaHa,
    'Area_km2': areaKm2,
    'Percent_CA': percentCA,
    'EVT_Codes': evt_codes.join(',')
  });
}


// ============================================================
// DEFINE EVT GROUPS
// ============================================================

var ca_dry_mesic = calcEVTArea(
  'CA Dry Mixed Conifer',
  [2027, 3027, 2031, 3031]
);

var ca_mesic = calcEVTArea(
  'CA Mesic Mixed Conifer',
  [2028, 3028]
);

var ca_montane = calcEVTArea(
  'CA Montane Conifer',
  [2033, 2044, 2058, 3030, 3033, 2032, 3032]
);

var ca_mixed_evergreen = calcEVTArea(
  'CA Mixed Evergreen Hardwood',
  [2043, 3043, 2014, 3014]
);

var ca_oak = calcEVTArea(
  'CA Mixed Oak Woodland',
  [2029, 2030, 2112, 2113, 2114, 2118, 3029, 2008]
);

var non_forest = calcEVTArea(
  'Non-Forest',
  [3182, 3098, 3129, 3184, 3114, 3299, 3221,
   2182, 2138, 2184]
);

var riparian = calcEVTArea(
  'Riparian',
  [2152, 3138, 3152, 2154]
);

var other_forest = calcEVTArea(
  'Other Forest',
  [2021, 2022, 2034, 2099, 2170, 3021, 3022,
   3034, 2017, 2019, 2062, 2203, 2061, 2177]
);

var redwood = calcEVTArea(
  'CA Coastal Redwood',
  [2015, 3015]
);

var chaparral = calcEVTArea(
  'Chaparral Shrubland',
  [2098, 2105]
);


// ============================================================
// COMBINE RESULTS
// ============================================================

var results = ee.FeatureCollection([
  ca_dry_mesic,
  ca_mesic,
  ca_montane,
  ca_mixed_evergreen,
  ca_oak,
  non_forest,
  riparian,
  other_forest,
  redwood,
  chaparral
]);


// ============================================================
// PRINT RESULTS
// ============================================================

print('==========================================');
print('EVT GROUP RESULTS');
print('==========================================');

print(results);

print(
  'Total % represented by listed groups:',
  results.aggregate_sum('Percent_CA')
);


// ============================================================
// CHECK WHETHER GROUPS COVER ALL CALIFORNIA
// ============================================================

var classifiedAreaHa = results.aggregate_sum('Area_ha');

var classifiedPercent = ee.Number(classifiedAreaHa)
  .divide(totalCAHa)
  .multiply(100);

var unclassifiedPercent = ee.Number(100)
  .subtract(classifiedPercent);

var unclassifiedHa = ee.Number(totalCAHa)
  .subtract(classifiedAreaHa);

print('------------------------------------------');
print('CLASSIFICATION COVERAGE CHECK');
print('------------------------------------------');

print(
  'Area represented by listed EVT groups (ha):',
  classifiedAreaHa
);

print(
  'Percent of CA represented by listed groups:',
  classifiedPercent
);

print(
  'Unclassified/other area (ha):',
  unclassifiedHa
);

print(
  'Unclassified/other percent:',
  unclassifiedPercent
);


var testCodes = [2027, 3027, 2031, 3031];

testCodes.forEach(function(code) {

  var mask = evt_2001.eq(code);

  var area = ee.Image.pixelArea()
    .divide(10000)
    .updateMask(mask)
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: ca_geom,
      crs: 'EPSG:5070',
      scale: 30,
      maxPixels: 1e13,
      tileScale: 4
    });

  print(
    'EVT code ' + code + ' area ha:',
    area.get('area')
  );
});


// ============================================================
// EXPORT CSV
// ============================================================

// Export.table.toDrive({
//   collection: results,
//   description: 'CA_EVT_Statewide_Coverage',
//   fileNamePrefix: 'CA_EVT_Statewide_Coverage',
//   fileFormat: 'CSV'
// });

STOP

// ── 4. EXTRACTION TEMPLATE ────────────────────────────────────────────────────
// POINT extraction (topography, burn severity, categorical)
var extractPoint = function(image, plotFC, bandName, description) {
  return image.select(bandName).reduceRegions({
    collection: plotFC,
    reducer: ee.Reducer.first(),
    scale: 30
  });
};

// WEIGHTED MEAN extraction (NDVI, NBR, canopy, climate)
var extractMean = function(image, plotFC, bandName, description) {
  return image.select(bandName).reduceRegions({
    collection: plotFC,
    reducer: ee.Reducer.mean(),
    scale: 30
  });
};

// ──  EXTRACTION PLAN BY VARIABLE ───────────────────────────────────────────
// Use this as your reference:
//
// POINT extractions (use plotPoints):
//   - Elevation, slope, aspect         → USGS SRTM
//   - Burn severity class              → MTBS severity mosaic
//   - LANDFIRE EVT, EVC, EVH           → LANDFIRE
//   - Soil type                        → if applicable
//
// WEIGHTED MEAN extractions (use plotBuffers):
//   - NDVI, NBR timeseries             → Landsat
//   - Canopy cover                     → NLCD RCMAP
//   - Rangeland cover components       → RAP
//   - Climate (def, VPD, tmmx, SWE)    → TerraClimate
//   - Tree cover change                → Hansen GFC loss/gain


////////////////////////////////////////////////////////////////////////

// -- Plots_Usable_Final_Clean.csv -- //
// These are the Fire Ploygons filtered in R that underwent the spatial intersection
var cleanfires = ee.FeatureCollection('projects/britthays-uwyo/assets/Plots_Usable_Final_Clean_08_2026');
// Get 195 clean Fire_IDs
var cleanPlots = ee.FeatureCollection('projects/britthays-uwyo/assets/Plots_Usable_Final_Clean_08_2026');
print('Total plots:', cleanPlots.size());           // should be 20,675
print('Unique fires:', cleanPlots.aggregate_array('Fire_ID').distinct().size()); // should be 175

// ── Verify Fire_ID parsing before map ─────────────────────────────────────────
print('Fire_ID sample:', ee.String(cleanPlots.first().get('Fire_ID')));
print('Year slice:', ee.String(cleanPlots.first().get('Fire_ID')).slice(13, 17));

// ── Single plotList definition — parse year from Fire_ID only ─────────────────
// DELETE the second var plotList block entirely — do not run both

var plotList = cleanPlots.map(function(feature) {
  var lon    = ee.Number(feature.get('long'));
  var lat    = ee.Number(feature.get('lat'));
  
  // Extract year from Fire_ID string — position 13-17 (0-indexed)
  // CA3447411972520090505 → "2009"
  var fireID        = ee.String(feature.get('Fire_ID'));
  var igYearStr     = fireID.slice(13, 17);
  var formattedDate = igYearStr.cat('-01-01');
  var igYear        = ee.Number.parse(igYearStr);
  
  return feature
    .setGeometry(ee.Geometry.Point([lon, lat]))
    .set('formatted_date', formattedDate)
    .set('Ig_Year', igYear);
});

// ── Verify — run these prints separately after map above ──────────────────────
print('Total plots:', plotList.size());
print('Geometry type:', plotList.first().geometry().type());
print('Ig_Year:', plotList.first().get('Ig_Year'));
print('formatted_date:', plotList.first().get('formatted_date'));
print('Fire_ID:', plotList.first().get('Fire_ID'));
// Expect: 20675, Point, 2009, 2009-01-01, CA...

// ── Confirm plotList is ready for extraction ───────────────────────────────────
print('plotList ready:', plotList.size());          // 22041
print('Sample plot_key:', plotList.first().get('plot_key'));
print('Sample Category:', plotList.first().get('Category'));
print('Sample Correct_Plot_Label_final:', 
      plotList.first().get('Correct_Plot_Label_final'));

// ── Quick sanity check on coordinate range ────────────────────────────────────
var coords = plotList.first().geometry().coordinates();
print('Sample coordinates:', coords);
// Expect longitude ~ -114 to -124, latitude ~ 32 to 42

// ── Check all available properties on first feature ───────────────────────────
print('All properties:', plotList.first().propertyNames());

// Redefine both versions
var plotPoints = plotList;

var plotBuffers = plotList.map(function(feature) {
  return ee.Feature(feature.geometry().buffer(56))
    .copyProperties(feature);
});

// Quick sanity check on map
Map.addLayer(plotList.limit(100), {color: 'red'}, 'Fixed plots');
//Map.centerObject(plotList.limit(100), 8);
// STEP 2 — Set up two plot versions in GEE:
//   plotPoints  → point extractions (topo, LANDFIRE, burn severity)
//   plotBuffers → 56m weighted mean (NDVI, NBR, canopy, climate)

// Two versions for extraction
var plotPoints = plotList;  // point extractions

var plotBuffers = plotList.map(function(feature) {
  return ee.Feature(feature.geometry().buffer(56))
    .copyProperties(feature);
});

print('Point plots:', plotPoints.size());    // 24,984
print('Buffer plots:', plotBuffers.size());  // 24,984

// STEP 3 — Extract static covariates first (single export each):
//   - Topography:  elevation, slope, aspect  → 3DEP point extraction
//   - LANDFIRE:    EVT, EVC, EVH, BPS        → point extraction
//   - Hansen GFC:  treecover2000, lossyear   → weighted mean extraction
//   - Burn severity class                    → MTBS point extraction

// STEP 4 — Extract dynamic timeseries (one export per variable):
//   - Landsat NDVI/NBR  → annual growing season mean 1990-2024
//   - RAP rangeland     → annual
//   - TerraClimate      → annual DEF, VPD, TMMX, SWE

// STEP 5 — Export all as CSV to Drive, merge in R by Fire_ID + long + lat

////////////////////////////////////////////////////////////////////////////////////////////
// Define range of years
var startDate = ee.Date('1990-01-01'); // include the month '2000-01-01
var endDate = ee.Date('2024-12-31');
var n_months = endDate.difference(startDate,'month').round();

// Set range of months to use for LANDSAT imagery: ONLY calc NDVI in the growing season
var firstMonth = 5;
var lastMonth = 10;

var startOfYear = ee.Date.fromYMD(1990, firstMonth, 1);  // Used for NDVI growing season: May 1st
var endOfYear = ee.Date.fromYMD(1990, lastMonth, 31);  // Used for NDVI growing season: October 31st (to match the end of the fire ssn)
////////////////////////////////////////////////////////////////////////////////////////////
// Load datasets ///////////////////////////////////////////////////////////////////////////

// -----------------------------Fixed Feature and Images:

// // Hansen Global Forest Change
var GFC = ee.Image('UMD/hansen/global_forest_change_2024_v1_12');
  //'UMD/hansen/global_forest_change_2023_v1_11'); // get the GFV v1_12 (2000-2024)
print(GFC,'GFC');

// // // 3DeP Topo
var elevation = ee.Image("USGS/3DEP/10m").select('elevation');
// Calculate slope and aspect from the DEM then calculate the solar radiance index in R
var slope = ee.Terrain.slope(elevation);
var aspect = ee.Terrain.aspect(elevation);

// // // // Combine the images into a single multi-band image.
var Topocombo1 = elevation.addBands(slope);
var TopoCollection = Topocombo1.addBands(aspect);
print(TopoCollection, '3DEP Topo');

// // LANDFIRE
// // 2014
// // // Define the individual images.
var LFevc = ee.Image('LANDFIRE/Vegetation/EVC/v1_4_0/CONUS').select('EVC'); // Select the 'EVC' band
var LFevt = ee.Image('LANDFIRE/Vegetation/EVT/v1_4_0/CONUS').select('EVT'); // Select the 'EVT' band
var LFevh = ee.Image('LANDFIRE/Vegetation/EVH/v1_4_0/CONUS').select('EVH');
var LFbps = ee.Image('LANDFIRE/Vegetation/BPS/v1_4_0/CONUS').select('BPS');

// // // Combine the images into a single multi-band image.
// // Combine the images into a single multi-band image.
var LFcombo1 = LFevc.addBands(LFevt);
var LFcombo2 = LFcombo1.addBands(LFevh);
var LFcombined = LFcombo2.addBands(LFbps);

// // Wrap the combined image into an ImageCollection (if you want to use map())
var LANDFIRE2014 = ee.ImageCollection([LFcombined]);

// // Now, you can apply the map function to the ImageCollection
LANDFIRE2014 = LANDFIRE2014.map(function(image) {
  // Create the start date
  var startDate = ee.Date('2014-01-01');
  
//   // Format the start date to 'YYYY-MM-dd'
  var formattedStartDate = startDate.format('YYYY-MM-dd');
  
//   // Set the numeric time_start property in milliseconds
  var timeStartMillis = startDate.millis();
  
//   // Set both the formatted date (as a string) and the numeric time_start (as milliseconds)
  return image
    .set('system:time_start', timeStartMillis) // Numeric time in milliseconds
    .set('formatted_time_start', formattedStartDate); // Formatted string date
});

// // 2001
// // Rename bands for clarity
var evc2001 = EVC2001.rename(['EVC01']);  // Renaming to meaningful names
var evt2001 = EVT2001.rename(['EVT01']);
var evh2001 = EVH2001.rename(['EVH01']);
var bps2001 = BPS2001.rename(['BPS01']); 

// // // Combine the images into a single multi-band image
var LFcombo3 = evc2001.addBands(evt2001);
var LFcombo4 = LFcombo3.addBands(evh2001);
var LFcombined2 = LFcombo4.addBands(bps2001); // Add BPS band

// // // Wrap the combined image into an ImageCollection (if you want to use map())
var LANDFIRE2001 = ee.ImageCollection([LFcombined2]);

// // // Apply map function to the ImageCollection
LANDFIRE2001 = LANDFIRE2001.map(function(image) {
  var startDate = ee.Date('2001-01-01');
  var formattedStartDate = startDate.format('YYYY-MM-dd');
  var timeStartMillis = startDate.millis();
  return image
    .set('system:time_start', timeStartMillis)
    .set('formatted_time_start', formattedStartDate);
});

// // // 2023 * No BPS in 2023
// // // Define the individual images.
var evc2023 = EVC2001.rename(['EVC23']);  // Renaming to meaningful names
var evt2023 = EVT2001.rename(['EVT23']);
var evh2023 = EVH2001.rename(['EVH23']);

// // // // Combine the images into a single multi-band image.
// // // Combine the images into a single multi-band image.
var LFcombo5 = evc2023.addBands(evt2023);
var LFcombined3 = LFcombo5.addBands(evh2023);

// // // Wrap the combined image into an ImageCollection (if you want to use map())
var LANDFIRE2023 = ee.ImageCollection([LFcombined3]);

// // Now, you can apply the map function to the ImageCollection
LANDFIRE2023 = LANDFIRE2023.map(function(image) {
  // Create the start date
  var startDate = ee.Date('2023-01-01');
  
//   // Format the start date to 'YYYY-MM-dd'
  var formattedStartDate = startDate.format('YYYY-MM-dd');
  
//   // Set the numeric time_start property in milliseconds
  var timeStartMillis = startDate.millis();
  
//   // Set both the formatted date (as a string) and the numeric time_start (as milliseconds)
  return image
    .set('system:time_start', timeStartMillis) // Numeric time in milliseconds
    .set('formatted_time_start', formattedStartDate); // Formatted string date
});

// -------------------------------Fixed Image Collections---------------------------//

// ------------MTBS Burn Severity
//USDA Forest Service/US Geological Survey. Monitoring Trends in Burn Severity Thematic Burn Severity. Salt Lake City, Utah/Sioux Falls, South Dakota
// // Function to get the start date from feature (MM-dd-YYYY format)
var getStartDateFromFeature = function(feature) {
  var igYear = feature.get('Ig_Year');  // Get ignition year as a string (MM-dd-YYYY)
  var startDate = ee.Date(igYear);  // Convert it to ee.Date
  return startDate;
};

// ── MTBS SEVERITY EXTRACTION (focal fire year only) ───────────────────────
var mtbsSeverity = ee.ImageCollection(
  'USFS/GTAC/MTBS/annual_burn_severity_mosaics/v1'
);

// ── MTBS SEVERITY EXTRACTION — with null image guard ──────────────────────────
var extractSeverity = function(feature) {
  var igYear = ee.Number(feature.get('Ig_Year')).int();
  
  // Filter to focal fire year MTBS image
  var severityCollection = mtbsSeverity
    .filter(ee.Filter.calendarRange(igYear, igYear, 'year'))
    .filter(ee.Filter.stringContains('system:index', 'CONUS'));
  
  // Guard against empty collection — check size before .first()
  var collSize = severityCollection.size();
  
  var severityImg = ee.Algorithms.If(
    collSize.gt(0),
    severityCollection.first().select('Severity'),
    null
  );
  
  // Buffer the point geometry
  var buffer = feature.geometry().buffer(56);
  
  // Only extract if image exists
  var meanSeverity = ee.Algorithms.If(
    collSize.gt(0),
    ee.Image(severityCollection.first().select('Severity'))
      .reduceRegion({
        reducer:   ee.Reducer.mean(),
        geometry:  buffer,
        scale:     30,
        maxPixels: 1e8
      }).get('Severity'),
    null
  );

  return feature
    .set('Severity_mean', meanSeverity)
    .set('Severity_year', igYear);
};

// ── Verify MTBS collection has images for your year range ─────────────────────
print('MTBS collection size:', mtbsSeverity.size());
print('MTBS years available:',
      mtbsSeverity.aggregate_array('system:index').sort());

// Test on one known fire year
var testYear = 2009;
var testImg  = mtbsSeverity
  .filter(ee.Filter.calendarRange(testYear, testYear, 'year'))
  .filter(ee.Filter.stringContains('system:index', 'CONUS'));
print('MTBS images for 2009:', testImg.size());
print('Band names:', testImg.first().bandNames());

// Apply to all plots
var severityExtracted = plotList.map(extractSeverity);

// Check result
print('Severity extraction check:', severityExtracted.limit(2));

// Verify values look reasonable
print('Sample severity values:', 
  severityExtracted.filter(
    ee.Filter.eq('Category', 'FP')
  ).limit(5).aggregate_array('Severity_mean'));

// Export the  the buffered weighted mean of mtbs burn sevrity for the fire year
// 4min on 05.02.2026
// Export.table.toDrive({
//   collection: severityExtracted,
//   description: 'MTBS_Severity_175_Focal_Year',
//   fileFormat: 'CSV',
//   folder: 'EarthEngine',
//   selectors: ['Fire_ID', 'Fire_Name', 'Category', 'Ig_Year',
//               'long', 'lat', 'plot_key', 'Severity_mean', 'Severity_year',
//               'Correct_Plot_Label_final']
// });

// remove sev_elev_class and elev_asp_class

// ── TOPOGRAPHY EXTRACTION (point) ─────────────────────────────────────────────
var dem = ee.Image('USGS/3DEP/10m');
var elevation = dem.select('elevation');
var slope = ee.Terrain.slope(elevation);
var aspect = ee.Terrain.aspect(elevation);

var topoImage = elevation
  .addBands(slope)
  .addBands(aspect)
  .rename(['elevation', 'slope', 'aspect']);

var topoExtracted = topoImage.reduceRegions({
  collection: plotPoints,
  reducer: ee.Reducer.mean(),
  scale: 10,  // 3DEP native resolution
  tileScale: 4
}).map(function(f) {
  return f.set({
    'elevation_m': f.get('elevation'),
    'slope_deg':   f.get('slope'),
    'aspect_deg':  f.get('aspect')
  });
});

// Check
// ── FAST TOPO TEST (10 plots only) ────────────────────────────────────────────
var topoTest = topoImage.reduceRegions({
  collection: plotPoints.limit(10),  // only 10 plots
  reducer: ee.Reducer.mean(),
  scale: 10,
  tileScale: 4
});

print('Topo test:', topoTest.limit(3));
print('Sample elevations:', topoTest.aggregate_array('elevation'));
print('Sample slopes:', topoTest.aggregate_array('slope'));
print('Sample aspects:', topoTest.aggregate_array('aspect'));

// Export in 2min
// Export.table.toDrive({
//   collection: topoExtracted,
//   description: 'Topography_175_3DEP',
//   fileFormat: 'CSV',
//   folder: 'EarthEngine',
//   selectors: ['Fire_ID', 'Fire_Name', 'Category', 'Ig_Year',
//               'long', 'lat', 'plot_key', 'elevation_m', 'slope_deg', 
//               'aspect_deg', 'Correct_Plot_Label_final']
// });

// Export <1min both are the same 05.02.2026
// Export.table.toDrive({
//   collection: topoImage.reduceRegions({
//     collection: plotPoints,
//     reducer: ee.Reducer.mean(),
//     scale: 10,
//     tileScale: 4
//   }),
//   description: 'Topography_175_3DEP',
//   fileFormat: 'CSV',
//   folder: 'EarthEngine',
//   selectors: ['Fire_ID', 'Fire_Name', 'Category', 'Ig_Year',
//               'long', 'lat', 'plot_key', 'elevation', 'slope',
//               'aspect', 'Correct_Plot_Label_final']
// });

// ── LANDFIRE EXTRACTION (point, categorical) ──────────────────────────────────
//The ecologically correct approach is pre-fire vegetation — 
//you want to know what the forest looked like before it burned, not after. 
//This means using the version closest to but before each fire's ignition year:

// Use pre-fire LANDFIRE version based on ignition year
// Available versions: 2001 (v1.0.5),  2014 (v1.4.0)

// ── LANDFIRE VERSION-MATCHED EXTRACTION ───────────────────────────────────────
// 2001 assets from your GEE project
var EVC_2001 = ee.Image('projects/britthays-uwyo/assets/EVC2001').rename('EVC');
var EVT_2001 = ee.Image('projects/britthays-uwyo/assets/EVT2001').rename('EVT');
var EVH_2001 = ee.Image('projects/britthays-uwyo/assets/EVH2001').rename('EVH');

// 2014 version from GEE catalog (covers 2008-2014 fires)
var EVC_2014 = ee.Image('LANDFIRE/Vegetation/EVC/v1_4_0/CONUS').rename('EVC');
var EVT_2014 = ee.Image('LANDFIRE/Vegetation/EVT/v1_4_0/CONUS').rename('EVT');
var EVH_2014 = ee.Image('LANDFIRE/Vegetation/EVH/v1_4_0/CONUS').rename('EVH');
var BPS_2014 = ee.Image('LANDFIRE/Vegetation/BPS/v1_4_0/CONUS').rename('BPS');

// Combined images per version
var LF_2001 = EVC_2001.addBands(EVT_2001).addBands(EVH_2001).addBands(BPS_2014);
var LF_2014 = EVC_2014.addBands(EVT_2014).addBands(EVH_2014).addBands(BPS_2014);

var getLANDFIRE = function(feature) {
  var igYear = ee.Number(feature.get('focal_year'));
  
  // Select version based on fire year
  var lfImage = ee.Image(ee.Algorithms.If(
    igYear.lte(2007),
    LF_2001,   // fires 2000-2007
    LF_2014    // fires 2008-2014
  ));
  
  var vals = lfImage.reduceRegion({
    reducer: ee.Reducer.first(),
    geometry: feature.geometry(),
    scale: 30,
    maxPixels: 1e8
  });
  
  return feature.set({
    'EVT':        vals.get('EVT'),
    'EVC':        vals.get('EVC'),
    'EVH':        vals.get('EVH'),
    'BPS':        vals.get('BPS'),
    'LF_version': igYear.lte(2007).and(ee.Number(1))  // 1=2001, 2=2014
                    .add(igYear.gt(2007).multiply(2))
  });
};

// ── TEST ──────────────────────────────────────────────────────────────────────
var LFtest = plotList.limit(10).map(getLANDFIRE);
print('LANDFIRE test:', LFtest.limit(3));
print('Sample EVT:', LFtest.aggregate_array('EVT'));
print('Sample EVC:', LFtest.aggregate_array('EVC'));
print('LF versions (1=2001, 2=2014):', LFtest.aggregate_array('LF_version'));
// Note*: Check the version categorization of EVT, EVC as these might vary slightly:
//EVT codes — NOT fully consistent across versions:
//The v1.4.0 EVT represents conditions through 2016, mapped using NatureServe's ecological systems classification Wiley Online Library
//LF 2022 retains circa 2016 EVT labels except where shifts in urban, agriculture, and developed classes occur MDPI — meaning EVT codes are relatively stable for natural forest vegetation but can shift in disturbed areas between versions
//EVC and EVH codes — change between versions:
//Beginning with LF 2020, EVC and EVH were updated to be "capable to X year" — adjusted to expected current vegetation conditions for disturbances Springer — meaning EVC and EVH values actively change between versions to reflect post-disturbance recovery

// Report the Version in the Methods: Pre-fire vegetation was characterized using LANDFIRE version 1.0.5 (2001) for fires igniting 2000–2007 and version 1.4.0 (2014) for fires igniting 2008–2014

var LFextracted = plotList.map(getLANDFIRE);

// Export (the point extractions) @ 1min 05.02.2026
// Export.table.toDrive({
//   collection: LFextracted,
//   description: 'LANDFIRE_175_VersionMatched',
//   fileFormat: 'CSV',
//   folder: 'EarthEngine',
//   selectors: ['Fire_ID', 'Fire_Name', 'Category', 'Ig_Year',
//               'long', 'lat', 'plot_key', 'EVT', 'EVC', 'EVH', 
//               'BPS', 'LF_version', 'Correct_Plot_Label_final']
// });

// ── HANSEN GFC EXTRACTION (buffered weighted mean) ────────────────────────────
var GFC = ee.Image('UMD/hansen/global_forest_change_2024_v1_12');

// Select relevant bands
var hansenImage = GFC.select([
  'treecover2000',  // % tree cover in 2000 (pre-fire baseline)
  'lossyear',       // year of forest loss (0=no loss, 1-24 = 2001-2024)
  'loss',           // binary loss detected
  'gain'            // binary gain detected
]);

// Use buffered weighted mean - continuous variables
var hansenTest = hansenImage.reduceRegions({
  collection: plotBuffers.limit(10),
  reducer: ee.Reducer.mean(),
  scale: 30,
  tileScale: 4
});

print('Hansen test:', hansenTest.limit(3));
print('Sample treecover2000:', hansenTest.aggregate_array('treecover2000'));
print('Sample lossyear:', hansenTest.aggregate_array('lossyear'));
print('Sample loss:', hansenTest.aggregate_array('loss'));

// While Hansen was used to determine forest cover, the values seem low for the 49.6% forest cover threshold set for choosing fire polygons

//CHECK
// Hansen bands need explicit scaling check
print('Hansen band info:', GFC.select('treecover2000'));

// Fix: ensure correct data type and mask zero-cover pixels
var hansenImage = GFC.select([
  'treecover2000',
  'lossyear',
  'loss',
  'gain'
]).unmask(0);  // fill masked pixels with 0

// Check raw pixel values at a known forested location
var testPoint = ee.Geometry.Point([-121.215948, 40.053408]);
print('Raw treecover2000 at test point:', 
  GFC.select('treecover2000').reduceRegion({
    reducer: ee.Reducer.first(),
    geometry: testPoint,
    scale: 30
  })
);

// Also check if plotBuffers geometry is correct
print('Buffer geometry type:', plotBuffers.first().geometry().type()); // should be Polygon
print('Buffer area m2:', plotBuffers.first().geometry().area());       // should be ~9852 (56m buffer)

// This looks correct the fire-level filter was mean tree cover >49.6% across the entire fire polygon, but individual plots are highly varied.

// Exported @ <1min 05.02.2026
// Export.table.toDrive({
//   collection: hansenImage.reduceRegions({
//     collection: plotBuffers,
//     reducer: ee.Reducer.mean(),
//     scale: 30,
//     tileScale: 4
//   }),
//   description: 'Hansen_GFC_175',
//   fileFormat: 'CSV',
//   folder: 'EarthEngine',
//   selectors: ['Fire_ID', 'Fire_Name', 'Category', 'Ig_Year',
//               'long', 'lat', 'plot_key', 'treecover2000',
//               'lossyear', 'loss', 'gain', 'Correct_Plot_Label_final']
// });

// ── Check aspect distribution in burned plots ─────────────────────────────────
// Add aspect to plotList if not already present

var srtm = ee.Image('USGS/SRTMGL1_003');
var aspect = ee.Terrain.aspect(srtm).rename('aspect_deg');

var addAspect = function(feature) {
  var asp = aspect.reduceRegion({
    reducer:  ee.Reducer.mean(),
    geometry: feature.geometry().buffer(56),
    scale:    30
  }).get('aspect_deg');
  
  // Classify aspect
  var aspNum = ee.Number(asp);
  var asp_class = ee.Algorithms.If(
    aspNum.lt(90).or(aspNum.gte(270)),
    'North',
    'South'
  );
  
  return feature
    .set('aspect_deg', asp)
    .set('asp_class_derived', asp_class);
};

var plotsWithAspect = plotList
  .filter(ee.Filter.eq('Category', 'FP'))
  .map(addAspect);

// Summarize aspect distribution in burned plots
print('Burned plot aspect distribution:',
  plotsWithAspect.aggregate_array('asp_class_derived')
    .reduce(ee.Reducer.frequencyHistogram()));
    
// ── Check aspect distribution in unburned plots for comparison ────────────────
var unburnedWithAspect = plotList
  .filter(ee.Filter.eq('Category', 'BP'))
  .filter(ee.Filter.eq('Correct_Plot_Label_final', 'Unburned_clean'))
  .map(addAspect);

print('Unburned plot aspect distribution:',
  unburnedWithAspect.aggregate_array('asp_class_derived')
    .reduce(ee.Reducer.frequencyHistogram()));    

// Get the Ecoregion CA shape file
var ecoregions = ee.FeatureCollection("EPA/Ecoregions/2013/L3");

// ── Visual check: show Klamath and Sierra Nevada polygons on the map ────────
var klamath = ecoregions.filter(ee.Filter.eq('us_l3name', 'Klamath Mountains/California High North Coast Range'));
var sierra  = ecoregions.filter(ee.Filter.eq('us_l3name', 'Sierra Nevada'));

Map.centerObject(ecoregions.filter(ee.Filter.eq('us_l3name', 'Sierra Nevada')), 6);
Map.addLayer(klamath, {color: 'blue'}, 'Klamath Mountains');
Map.addLayer(sierra, {color: 'red'}, 'Sierra Nevada');

// ── Print check: confirm exact ecoregion names in this dataset ─────────────
print('All CA-relevant ecoregion names:', 
  ecoregions.aggregate_array('us_l3name').distinct());

// ── Test the spatial join on a SMALL sample first, not the full plotList ───
var testSample = plotList.limit(20);  // just 20 plots to sanity-check

var testJoined = testSample.map(function(pt) {
  var match = ecoregions.filterBounds(pt.geometry()).first();
  return pt.set('ecoregion', match.get('us_l3name'));
});

print('Test sample with ecoregion attached:', testJoined);

// Spatial join: attach us_l3name to each plot
var plotsWithEcoregion = plotList.map(function(pt) {
  var match = ecoregions.filterBounds(pt.geometry()).first();
  return pt.set('ecoregion', match.get('us_l3name'));
});

var plotsWithEcoregion = plotList.map(function(pt) {
  var match = ecoregions.filterBounds(pt.geometry()).first();
  var ecoName = ee.Algorithms.If(match, match.get('us_l3name'), 'NO_MATCH');
  return pt.set('ecoregion', ecoName);
});

var testJoined = plotList.limit(500).map(function(pt) {
  var match = ecoregions.filterBounds(pt.geometry()).first();
  var ecoName = ee.Algorithms.If(match, match.get('us_l3name'), 'NO_MATCH');
  return pt.set('ecoregion', ecoName);
});

print('Count of NO_MATCH in sample of 500:', 
  testJoined.filter(ee.Filter.eq('ecoregion', 'NO_MATCH')).size());

// Export as CSV
Export.table.toDrive({
  collection: plotsWithEcoregion,
  description: 'plots_with_ecoregion',
  fileFormat: 'CSV',
  selectors: ['plot_key', 'ecoregion']   // only export what you need
});

// -------------------------------Dynamic Image Collections---------------------------//
// weighted means versus point extractions

// Landsat:
//the NDVI and NBR values are weighted means, are these calculated annually from growing season (May -October) 
// Then within the growing season, the yearly composite uses `.median()` across all images in that window — so each annual value is the **median of all cloud-free growing season observations** for that year. This is standard practice for Landsat timeseries to reduce cloud/noise effects.

// ── LANDSAT SETUP (from your existing code) ───────────────────────────────────
var startDate = ee.Date('1990-01-01');
var endDate = ee.Date('2024-12-31');
var firstMonth = 5;   // May
var lastMonth = 10;   // October

// Scaling and masking functions (unchanged from your code)
function applyScaleFactors(image) {
  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
  var thermalBands = image.select('ST_B.*').multiply(0.00341802).add(149.0);
  return image.addBands(opticalBands, null, true)
              .addBands(thermalBands, null, true);
}

function maskL8sr(image) {
  var qaMask = image.select('QA_PIXEL').bitwiseAnd(parseInt('11111', 2)).eq(0);
  return image.updateMask(qaMask);
}

// Index functions (unchanged from your code)
var ls8_9_Indices = function(lsImage) {
  var nbr  = lsImage.normalizedDifference(['SR_B5', 'SR_B7']).rename('NBR');
  var ndvi = lsImage.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
  return nbr.addBands(ndvi)
    .copyProperties(lsImage, ['system:time_start']);
};

var ls4_7_Indices = function(lsImage) {
  var nbr  = lsImage.normalizedDifference(['SR_B4', 'SR_B7']).rename('NBR');
  var ndvi = lsImage.normalizedDifference(['SR_B4', 'SR_B3']).rename('NDVI');
  return nbr.addBands(ndvi)
    .copyProperties(lsImage, ['system:time_start']);
};

// Merged Landsat collection (unchanged from your code)
var ls89SR = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
  .filter(ee.Filter.date(startDate, endDate))
  .filter(ee.Filter.calendarRange(firstMonth, lastMonth, 'month'))
  .map(applyScaleFactors)
  .map(maskL8sr)
  .map(ls8_9_Indices);

var ls457SR = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
  .merge(ee.ImageCollection('LANDSAT/LT05/C02/T1_L2'))
  .merge(ee.ImageCollection('LANDSAT/LT04/C02/T1_L2'))
  .filter(ee.Filter.date(startDate, endDate))
  .filter(ee.Filter.calendarRange(firstMonth, lastMonth, 'month'))
  .map(applyScaleFactors)
  .map(maskL8sr)
  .map(ls4_7_Indices);

var landsatIndices = ee.ImageCollection(ls89SR.merge(ls457SR))
  .filterBounds(CA);

// ── YEARLY COMPOSITE (from your existing code) ────────────────────────────────
var years = ee.List.sequence(1990, 2024, 1);

var createYearlyComposite = function(year) {
  var start = ee.Date.fromYMD(year, firstMonth, 1);
  var end   = ee.Date.fromYMD(year, lastMonth, 30);
  return landsatIndices
    .filterDate(start, end)
    .median()
    .set('year', year)
    .set('system:time_start', start.millis());
};

var LSyearlyComposites = ee.ImageCollection.fromImages(
  years.map(function(year) {
    return createYearlyComposite(ee.Number(year));
  })
);

print('Yearly composites:', LSyearlyComposites.size());  // should be 35

// ── NEW: EXTRACT NDVI/NBR PER PLOT PER YEAR ───────────────────────────────────
// - **Mean** — appropriate for continuous spectral values across a small homogeneous buffer (56m = ~3×3 pixels). Gives equal weight to all pixels in the plot neighborhood

// Map over each yearly composite and extract weighted mean for all plots
var extractNDVI_NBR = function(image) {
  var year = ee.Number(image.get('year')).toInt();

  var reduced = image.select(['NDVI', 'NBR']).reduceRegions({
    collection: plotBuffers,   // 56m weighted mean
    reducer: ee.Reducer.mean(),
    scale: 30,
    tileScale: 4
  });

  // Tag each feature with the year
  return reduced.map(function(f) {
    return f.set({
      'year':      year,
      'NDVI_mean': f.get('mean'),  // will fix naming below
    });
  });
};

// ── TEST ON SINGLE YEAR FIRST ─────────────────────────────────────────────────
var testYear = LSyearlyComposites
  .filter(ee.Filter.eq('year', 2000))
  .first();

var testExtract = testYear.select(['NDVI', 'NBR']).reduceRegions({
  collection: plotBuffers.limit(10),
  reducer: ee.Reducer.mean(),
  scale: 30,
  tileScale: 4
}).map(function(f) {
  return f.set('year', 2000)
          .set('NDVI_mean', f.get('NDVI'))
          .set('NBR_mean',  f.get('NBR'));
});

print('NDVI/NBR test year 2000:', testExtract.limit(3));
print('Sample NDVI:', testExtract.aggregate_array('NDVI')); // NDVI values should be 0.3-0.8 for forested plots in growing season
print('Sample NBR:',  testExtract.aggregate_array('NBR')); //NBR 0.35-0.77 expected for forested plots

// ── FULL 35-YEAR NDVI/NBR EXPORT ─────────────────────────────────────────────
// 1. Filter to growing season images (May-October)
// 2. Take pixel-wise median across all images in that year → annual composite
// 3. Take spatial mean across 56m buffer → plot value

var allYearsNDVI = LSyearlyComposites.map(function(image) {
  var year = ee.Number(image.get('year')).toInt();
  
  return image.select(['NDVI', 'NBR']).reduceRegions({
    collection: plotBuffers,
    reducer: ee.Reducer.mean(),
    scale: 30,
    tileScale: 4
  }).map(function(f) {
    return f.set('year', year);
  });
}).flatten();

//print('Total rows expected:', allYearsNDVI.size()); // ~875,000 - may timeout, skip if so

// Export @ 37min time 05.02.2026
// Export.table.toDrive({
//   collection: allYearsNDVI,
//   description: 'Landsat_NDVI_NBR_175_1990_2024',
//   fileFormat: 'CSV',
//   folder: 'EarthEngine',
//   selectors: ['Fire_ID', 'Fire_Name', 'Category', 'Ig_Year',
//               'long', 'lat', 'plot_key', 'year',
//               'NDVI', 'NBR', 'Correct_Plot_Label_final']
// });

// Corrected 06.18.2026
// Citation: Abatzoglou, J.T., S.Z. Dobrowski, S.A. Parks, K.C. Hegewisch, 2018, Terraclimate, a high-resolution global dataset of monthly climate and climatic water balance from 1958-2015, Scientific Data 5:170191, doi:10.1038/sdata.2017.191
// ============================================================
// CH1 TERRACLIMATE EXTRACTION — Plot-level Annual + Normals
// Built from Ch2 (Doc 4) logic, adapted for Ch1 plot centroids
// Britt Hays — Chapter 1: 175 CA fires, 22,041 plots
// ============================================================

// ── SCALING FACTORS (matches Ch2 Doc 4) ──────────────────────────────────────
// def:  ×0.1  → mm    (annual SUM)
// vpd:  ×0.1 → kPa  (annual MEAN)  
// tmmx: ×0.1  → °C   (growing season MAX, Jul-Aug MEAN)
// swe:  ×1    → mm   (April MAX)
// pdsi: ×0.01 → index (annual MEAN)

// ── LOAD PLOTS ───────────────────────────────────────────────────────
// Replace with your actual Ch1 plot asset path
// Each feature needs: plot_key, Fire_ID, Ig_Year (or fire_year),
//                     Correct_Plot_Label_final, lat, lon
var plotCentroids = plotList.map(function(feature) {
  return feature.centroid(1).copyProperties(feature);
});

print('Centroid check:', plotCentroids.first().geometry().type());  // Point

var tcYears = ee.List.sequence(1985, 2025);

print('Plot count (expect 22041):', plotCentroids.size());
print('Centroid geometry type (expect Point):',
      plotCentroids.first().geometry().type());
print('Property names:', plotCentroids.first().propertyNames());

// ── SCALED TERRACLIMATE ───────────────────────────────────────────────────────
var scaledTerraclimate = ee.ImageCollection('IDAHO_EPSCOR/TERRACLIMATE')
  .filterDate('1985-01-01', '2025-01-01')
  .map(function(img) {
    var def  = img.select('def') .multiply(0.1)   .rename('def_mm');
    var vpd  = img.select('vpd') .multiply(0.01) .rename('vpd_kPa'); //TerraClimate VPD is stored in units of Pa×10 (hectopascals scaled), so ×0.01 → kPa
    var tmmx = img.select('tmmx').multiply(0.1)   .rename('tmmx_C');
    var swe  = img.select('swe')                  .rename('swe_mm');
    var pdsi = img.select('pdsi').multiply(0.01)  .rename('pdsi');
    return ee.Image([def, vpd, tmmx, swe, pdsi])
      .copyProperties(img, img.propertyNames())
      .set('system:time_start', img.get('system:time_start'));
  });

var tcYears = ee.List.sequence(1985, 2024);

// ── SELECTORS — reuse in all exports ─────────────────────────────────────────
var tcSelectors = [
  'plot_key', 'Fire_ID', 'Ig_Year',
  'Correct_Plot_Label_final', 'lat', 'long', 'year'
];

// ============================================================
// ANNUAL EXTRACTION FUNCTIONS (one variable group per function)
// Mirrors Ch2 pattern: separate extractions, explicit output names
// ============================================================

// ── 1. DEF annual sum ─────────────────────────────────────────────────────────
var getAnnualDef = function(year) {
  year = ee.Number(year);

  var img = scaledTerraclimate
    .filter(ee.Filter.calendarRange(year, year, 'year'))
    .select('def_mm')
    .sum()
    .rename('def_ann_sum');

  return img.reduceRegions({
    collection: plotCentroids,
    reducer:    ee.Reducer.mean().setOutputs(['def_ann_sum']),
    scale:      4638,
    crs:        'EPSG:4326'
  }).map(function(f) { return f.set('year', year); });
};

// ── 2. April SWE maximum ──────────────────────────────────────────────────────
var getAnnualSWE = function(year) {
  year = ee.Number(year);

  var img = scaledTerraclimate
    .filter(ee.Filter.calendarRange(year, year, 'year'))
    .filter(ee.Filter.calendarRange(4, 4, 'month'))
    .select('swe_mm')
    .max()                       // max within April (usually 1 image)
    .rename('swe_april_max');

  return img.reduceRegions({
    collection: plotCentroids,
    reducer:    ee.Reducer.mean().setOutputs(['swe_april_max']),
    scale:      4638,
    crs:        'EPSG:4326'
  }).map(function(f) { return f.set('year', year); });
};

// ── 3. TMMX — growing season max + Jul-Aug mean ───────────────────────────────
// Extracted separately then joined on plot_key (mirrors Ch2 pattern)
var getAnnualTMMX = function(year) {
  year = ee.Number(year);

  var tmmx_max = scaledTerraclimate
    .filter(ee.Filter.calendarRange(year, year, 'year'))
    .filter(ee.Filter.calendarRange(5, 10, 'month'))
    .select('tmmx_C')
    .max()
    .rename('tmmx_max_growing');

  var tmmx_JulAug = scaledTerraclimate
    .filter(ee.Filter.calendarRange(year, year, 'year'))
    .filter(ee.Filter.calendarRange(7, 8, 'month'))
    .select('tmmx_C')
    .mean()
    .rename('tmmx_mean_JulAug');

  var ext_max = tmmx_max.reduceRegions({
    collection: plotCentroids,
    reducer:    ee.Reducer.mean().setOutputs(['tmmx_max_growing']),
    scale:      4638,
    crs:        'EPSG:4326'
  });

  var ext_JulAug = tmmx_JulAug.reduceRegions({
    collection: plotCentroids,
    reducer:    ee.Reducer.mean().setOutputs(['tmmx_mean_JulAug']),
    scale:      4638,
    crs:        'EPSG:4326'
  });

  var joined = ee.Join.saveFirst('match').apply({
    primary:   ext_max,
    secondary: ext_JulAug,
    condition: ee.Filter.equals({
      leftField:  'plot_key',
      rightField: 'plot_key'
    })
  });

  return joined.map(function(f) {
    var match = ee.Feature(f.get('match'));
    return f
      .set('tmmx_mean_JulAug', match.get('tmmx_mean_JulAug'))
      .set('year', year);
  });
};

// ── 4. VPD annual mean + PDSI annual mean ────────────────────────────────────
var getAnnualVPD_PDSI = function(year) {
  year = ee.Number(year);

  var vpd_img = scaledTerraclimate
    .filter(ee.Filter.calendarRange(year, year, 'year'))
    .select('vpd_kPa')
    .mean()
    .rename('vpd_ann_mean');

  var pdsi_img = scaledTerraclimate
    .filter(ee.Filter.calendarRange(year, year, 'year'))
    .select('pdsi')
    .mean()
    .rename('pdsi_ann_mean');

  var ext_vpd = vpd_img.reduceRegions({
    collection: plotCentroids,
    reducer:    ee.Reducer.mean().setOutputs(['vpd_ann_mean']),
    scale:      4638,
    crs:        'EPSG:4326'
  });

  var ext_pdsi = pdsi_img.reduceRegions({
    collection: plotCentroids,
    reducer:    ee.Reducer.mean().setOutputs(['pdsi_ann_mean']),
    scale:      4638,
    crs:        'EPSG:4326'
  });

  var joined = ee.Join.saveFirst('match').apply({
    primary:   ext_vpd,
    secondary: ext_pdsi,
    condition: ee.Filter.equals({
      leftField:  'plot_key',
      rightField: 'plot_key'
    })
  });

  return joined.map(function(f) {
    var match = ee.Feature(f.get('match'));
    return f
      .set('pdsi_ann_mean', match.get('pdsi_ann_mean'))
      .set('year', year);
  });
};

// ============================================================
// QC CHECKS — run these before exporting
// ============================================================

print('--- DEF ann sum (expect 100-900 mm for CA forests) ---');
print(getAnnualDef(2005).limit(5).aggregate_array('def_ann_sum'));

print('--- SWE April max (expect 0-500 mm, elevation dependent) ---');
print(getAnnualSWE(2005).limit(5).aggregate_array('swe_april_max'));

print('--- TMMX max growing season (expect 25-40°C) ---');
print(getAnnualTMMX(2005).limit(5).aggregate_array('tmmx_max_growing'));

print('--- TMMX Jul-Aug mean (expect 23-38°C) ---');
print(getAnnualTMMX(2005).limit(5).aggregate_array('tmmx_mean_JulAug'));

print('--- VPD ann mean (expect 0.5-2.0 kPa) ---');
print(getAnnualVPD_PDSI(2005).limit(5).aggregate_array('vpd_ann_mean'));

print('--- PDSI ann mean (expect -4 to +4) ---');
print(getAnnualVPD_PDSI(2005).limit(5).aggregate_array('pdsi_ann_mean'));

// Verify plot_key and label survived extraction
print('plot_key present:', getAnnualDef(2005).first().get('plot_key'));
print('Fire_ID present:', getAnnualDef(2005).first().get('Fire_ID'));
print('Year tag:', getAnnualDef(2005).first().get('year'));

// High vs low elevation SWE spot check
print('High lat SWE 2008:expect above 0, lat > 38',
  getAnnualSWE(2008)
    .filter(ee.Filter.gt('lat', 38))
    .limit(5).aggregate_array('swe_april_max'));

print('Low lat SWE (expect near 0, lat < 35):',
  getAnnualSWE(2008)
    .filter(ee.Filter.lt('lat', 35))
    .limit(5).aggregate_array('swe_april_max'));

// ============================================================
// 30-YEAR CLIMATE NORMALS (fixed 1991-2020, plot-level)
// Uses same scaling as annual extraction
// ============================================================

// DEF normal: mean of annual sums (correct approach — matches Ch2)
var defNormal = ee.ImageCollection(
  ee.List.sequence(1991, 2020).map(function(year) {
    return scaledTerraclimate
      .filter(ee.Filter.calendarRange(year, year, 'year'))
      .select('def_mm')
      .sum();                    // annual sum first, then mean across years
  })
).mean().rename('def_normal_ann');

// SWE normal: mean of April values across 30 years
var sweNormal = scaledTerraclimate
  .filterDate('1991-01-01', '2020-12-31')
  .filter(ee.Filter.calendarRange(4, 4, 'month'))
  .select('swe_mm')
  .mean()
  .rename('swe_normal_april');

// VPD normal: annual mean across 30 years
var vpdNormal = scaledTerraclimate
  .filterDate('1991-01-01', '2020-12-31')
  .select('vpd_kPa')
  .mean()
  .rename('vpd_normal_ann');

// PDSI normal: annual mean across 30 years
var pdsiNormal = scaledTerraclimate
  .filterDate('1991-01-01', '2020-12-31')
  .select('pdsi')
  .mean()
  .rename('pdsi_normal_ann');

// TMMX normals: mean of annual growing season max (matches annual extraction)
var tmmxMaxGrowingNormal = ee.ImageCollection(
  ee.List.sequence(1991, 2020).map(function(year) {
    return scaledTerraclimate
      .filter(ee.Filter.calendarRange(year, year, 'year'))
      .filter(ee.Filter.calendarRange(5, 10, 'month'))
      .select('tmmx_C')
      .max();
  })
).mean().rename('tmmx_normal_max_growing');

var tmmxJulAugNormal = scaledTerraclimate
  .filterDate('1991-01-01', '2020-12-31')
  .filter(ee.Filter.calendarRange(7, 8, 'month'))
  .select('tmmx_C')
  .mean()
  .rename('tmmx_normal_JulAug');

// Combine into single image
var climateNormals = defNormal
  .addBands(sweNormal)
  .addBands(vpdNormal)
  .addBands(pdsiNormal)
  .addBands(tmmxMaxGrowingNormal)
  .addBands(tmmxJulAugNormal);

print('Normals band names:', climateNormals.bandNames());

// Extract at plot centroids
var normalsPerPlot = climateNormals.reduceRegions({
  collection: plotCentroids,
  reducer:    ee.Reducer.mean(),
  scale:      4638,
  crs:        'EPSG:4326'
});

// QC normals
print('--- DEF normal ann (expect 400-700 mm) ---');
print(normalsPerPlot.limit(5).aggregate_array('def_normal_ann'));

print('--- SWE normal April (expect 0-300 mm) ---');
print(normalsPerPlot.limit(5).aggregate_array('swe_normal_april'));

print('--- TMMX normal max growing (expect 28-38°C) ---');
print(normalsPerPlot.limit(5).aggregate_array('tmmx_normal_max_growing'));

print('--- VPD normal ann (expect 0.5-1.5 kPa) ---');
print(normalsPerPlot.limit(5).aggregate_array('vpd_normal_ann'));

print('--- PDSI normal ann (expect near 0) ---');
print(normalsPerPlot.limit(5).aggregate_array('pdsi_normal_ann'));

// ============================================================
// EXPORTS — uncomment one at a time to avoid timeouts
// ============================================================

Export.table.toDrive({
  collection:  ee.FeatureCollection(tcYears.map(getAnnualDef)).flatten(),
  description: 'Ch1_TerraClimate_DEF_1985_2024',
  folder:      'EarthEngine',
  fileFormat:  'CSV',
  selectors:   tcSelectors.concat(['def_ann_sum'])
});

Export.table.toDrive({
  collection:  ee.FeatureCollection(tcYears.map(getAnnualSWE)).flatten(),
  description: 'Ch1_TerraClimate_SWE_1985_2024',
  folder:      'EarthEngine',
  fileFormat:  'CSV',
  selectors:   tcSelectors.concat(['swe_april_max'])
});

Export.table.toDrive({
  collection:  ee.FeatureCollection(tcYears.map(getAnnualTMMX)).flatten(),
  description: 'Ch1_TerraClimate_TMMX_1985_2024',
  folder:      'EarthEngine',
  fileFormat:  'CSV',
  selectors:   tcSelectors.concat(['tmmx_max_growing', 'tmmx_mean_JulAug'])
});

Export.table.toDrive({
  collection:  ee.FeatureCollection(tcYears.map(getAnnualVPD_PDSI)).flatten(),
  description: 'Ch1_TerraClimate_VPD_PDSI_1985_2024',
  folder:      'EarthEngine',
  fileFormat:  'CSV',
  selectors:   tcSelectors.concat(['vpd_ann_mean', 'pdsi_ann_mean'])
});

Export.table.toDrive({
  collection:  normalsPerPlot,
  description: 'Ch1_TerraClimate_Normals_1991_2020',
  folder:      'EarthEngine',
  fileFormat:  'CSV',
  selectors:   tcSelectors.concat([
    'def_normal_ann', 'swe_normal_april', 'vpd_normal_ann',
    'pdsi_normal_ann', 'tmmx_normal_max_growing', 'tmmx_normal_JulAug'
  ])
});

STOP

//OLD Broken

// ── TERRACLIMATE EXTRACTION ───────────────────────────────────────────────────
// Citation: Abatzoglou, J.T., S.Z. Dobrowski, S.A. Parks, K.C. Hegewisch, 2018, Terraclimate, a high-resolution global dataset of monthly climate and climatic water balance from 1958-2015, Scientific Data 5:170191, doi:10.1038/sdata.2017.191
// ── SCALING FACTORS ───────────────────────────────────────────────────────────
// IMPORTANT: TerraClimate variables need scaling:
// def:  × 0.1  → mm (climatic water deficit)
// pdsi: × 0.01 → Palmer Drought Severity Index
// swe:  × 1    → mm (snow water equivalent) no scaling needed
// tmmx: × 0.1  → °C (max temperature)
// vpd:  × 0.001 → kPa (vapor pressure deficit)

// ── ANNUAL AGGREGATION ────────────────────────────────────────────────────────
// def:  annual SUM (total annual deficit)
// swe:  annual MAX (peak snowpack)
// tmmx: annual MAX (maximum temperature)
// vpd:  annual MAX (maximum vapor pressure deficit)
// pdsi: annual MEAN (average drought conditions)

// *Be aware* the 56m polygon buffer is too small to intersect the 4.6km TC pixel centroids :
// Use centroid-based sampleRegions at 4000m scale:
// ── ANNUAL CLIMATE EXTRACTION — integrates with your existing setup ────────────
// Uses scaledTerraclimate and plotCentroids already defined above

// ── TERRACLIMATE SETUP ────────────────────────────────────────────────────────
// var scaledTerraclimate = ee.ImageCollection('IDAHO_EPSCOR/TERRACLIMATE')
//   .filterDate('1990-01-01', '2024-12-31')
//   .map(function(img) {
//     var tmmx = img.select('tmmx').multiply(0.1).rename('tmmx_C');
//     var def  = img.select('def').multiply(0.1).rename('def_mm');
//     var vpd  = img.select('vpd').multiply(0.01).rename('vpd_kPa');
//     var swe  = img.select('swe').rename('swe_mm');
//     var pdsi = img.select('pdsi').multiply(0.01).rename('pdsi');
//     return ee.Image([tmmx, def, vpd, swe, pdsi])
//       .copyProperties(img, img.propertyNames())
//       .set('system:time_start', img.get('system:time_start'));
//   });

// // ── CONVERT PLOTS TO CENTROIDS ────────────────────────────────────────────────
// // Centroid sampling ensures every plot gets a value regardless of buffer size
// var plotCentroids = plotList.map(function(feature) {
//   return feature.centroid(1).copyProperties(feature);
// });

// print('Centroid check:', plotCentroids.first().geometry().type());  // Point

// var tcYears = ee.List.sequence(1990, 2024);

// var extractClimateAnnual = function(year) {
//   year = ee.Number(year);
  
//   // Annual sum CWD
//   var cwd_annual = scaledTerraclimate
//     .filter(ee.Filter.calendarRange(year, year, 'year'))
//     .select('def_mm')
//     .sum()
//     .rename('def_ann_sum');
  
//   // Annual mean VPD
//   var vpd_annual = scaledTerraclimate
//     .filter(ee.Filter.calendarRange(year, year, 'year'))
//     .select('vpd_kPa')
//     .mean()
//     .rename('vpd_ann_mean');
  
//   // April SWE
//   var swe_april = scaledTerraclimate
//     .filter(ee.Filter.calendarRange(year, year, 'year'))
//     .filter(ee.Filter.calendarRange(4, 4, 'month'))
//     .select('swe_mm')
//     .mean()
//     .rename('swe_april');

//   // OPTION A: Maximum monthly tmmx_C in growing season (May-Oct)
//   // Captures peak thermal stress — use this per advisor feedback
//   var tmmx_max_growing = scaledTerraclimate
//     .filter(ee.Filter.calendarRange(year, year, 'year'))
//     .filter(ee.Filter.calendarRange(5, 10, 'month'))
//     .select('tmmx_C')
//     .max()
//     .rename('tmmx_max_growing');

//   // OPTION B: Mean July-August tmmx_C — keep as secondary variable
//   // Useful for sensitivity check against Option A
//   var tmmx_mean_JulAug = scaledTerraclimate
//     .filter(ee.Filter.calendarRange(year, year, 'year'))
//     .filter(ee.Filter.calendarRange(7, 8, 'month'))
//     .select('tmmx_C')
//     .mean()
//     .rename('tmmx_mean_JulAug');

//   // PDSI annual mean — already in your original extraction
//   var pdsi_annual = scaledTerraclimate
//     .filter(ee.Filter.calendarRange(year, year, 'year'))
//     .select('pdsi')
//     .mean()
//     .rename('pdsi_ann_mean');

//   return cwd_annual
//     .addBands(vpd_annual)
//     .addBands(swe_april)
//     .addBands(tmmx_max_growing)
//     .addBands(tmmx_mean_JulAug)
//     .addBands(pdsi_annual)
//     .set('year', year);
// };

// // ── Extract per plot per year using centroids ──────────────────────────────────
// var extractClimatePerPlot = function(year) {
//   year = ee.Number(year);

//   var yearImg = ee.ImageCollection(tcYears.map(extractClimateAnnual))
//     .filter(ee.Filter.eq('year', year))
//     .first();

//   var extracted = yearImg.reduceRegions({
//     collection: plotCentroids,       // use your existing plotCentroids
//     reducer:    ee.Reducer.mean(),
//     scale:      4638,                // TerraClimate native resolution
//     crs:        'EPSG:4326'
//   });

//   return extracted.map(function(f) {
//     return f.set('year', year);
//   });
// };

// // ── Standard selectors — define once, reuse in all exports ────────────────────
// var tcSelectors = [
//   'Fire_ID', 'Fire_Name', 'Category', 'Ig_Year',
//   'long', 'lat', 'plot_key', 'year', 
//   'Correct_Plot_Label_final'
// ];

// // ── DEF annual sum ─────────────────────────────────────────────────────────────
// // ── Fix DEF extraction — use reduceRegions output name explicitly ──────────────
// var getAnnualDef = function(year) {
//   year = ee.Number(year);
  
//   var img = scaledTerraclimate
//     .filter(ee.Filter.calendarRange(year, year, 'year'))
//     .select('def_mm')
//     .sum()
//     .rename('def_ann_sum');
  
//   var extracted = img.reduceRegions({
//     collection: plotCentroids,
//     reducer:    ee.Reducer.mean().setOutputs(['def_ann_sum']),
//     scale:      4638,
//     crs:        'EPSG:4326'
//   });
  
//   return extracted.map(function(f) { 
//     return f.set('year', year); 
//   });
// };

// // Verify fix
// var defTest2 = getAnnualDef(2000);
// print('DEF fixed — property names:', defTest2.first().propertyNames());
// print('DEF fixed — values:', 
//       defTest2.limit(5).aggregate_array('def_ann_sum'));
// // Expect [700-900] range for CA in 2000


// // ── SWE April maximum ──────────────────────────────────────────────────────────
// var getAnnualSWE = function(year) {
//   year = ee.Number(year);
  
//   var img = scaledTerraclimate
//     .filter(ee.Filter.calendarRange(year, year, 'year'))
//     .filter(ee.Filter.calendarRange(4, 4, 'month'))
//     .select('swe_mm')
//     .max()
//     .rename('swe_april_max');
  
//   var extracted = img.reduceRegions({
//     collection: plotCentroids,
//     reducer:    ee.Reducer.mean().setOutputs(['swe_april_max']),
//     scale:      4638,
//     crs:        'EPSG:4326'
//   });
  
//   return extracted.map(function(f) { 
//     return f.set('year', year); 
//   });
// };

// // Verify
// print('SWE fixed — values:',
//       getAnnualSWE(2000).limit(5).aggregate_array('swe_april_max'));

// // ── TMMX — two metrics replacing old growing season mean ──────────────────────
// // Option A: maximum monthly tmmx in growing season (May-Oct) — primary metric
// // Option B: mean July-August tmmx — secondary/sensitivity metric
// // ── Apply same fix to all other extraction functions ──────────────────────────
// // ── Fix TMMX — reduce each band separately ────────────────────────────────────
// var getAnnualTMMX = function(year) {
//   year = ee.Number(year);
  
//   var tmmx_max = scaledTerraclimate
//     .filter(ee.Filter.calendarRange(year, year, 'year'))
//     .filter(ee.Filter.calendarRange(5, 10, 'month'))
//     .select('tmmx_C')
//     .max()
//     .rename('tmmx_max_growing');
  
//   var tmmx_JulAug = scaledTerraclimate
//     .filter(ee.Filter.calendarRange(year, year, 'year'))
//     .filter(ee.Filter.calendarRange(7, 8, 'month'))
//     .select('tmmx_C')
//     .mean()
//     .rename('tmmx_mean_JulAug');

//   // Extract each band separately then join results
//   var extracted_max = tmmx_max.reduceRegions({
//     collection: plotCentroids,
//     reducer:    ee.Reducer.mean().setOutputs(['tmmx_max_growing']),
//     scale:      4638,
//     crs:        'EPSG:4326'
//   });

//   var extracted_JulAug = tmmx_JulAug.reduceRegions({
//     collection: plotCentroids,
//     reducer:    ee.Reducer.mean().setOutputs(['tmmx_mean_JulAug']),
//     scale:      4638,
//     crs:        'EPSG:4326'
//   });

//   // Join the two extractions on plot_key
//   var joined = ee.Join.saveFirst('match').apply({
//     primary:   extracted_max,
//     secondary: extracted_JulAug,
//     condition: ee.Filter.equals({
//       leftField:  'plot_key',
//       rightField: 'plot_key'
//     })
//   });

//   return joined.map(function(f) {
//     var match = ee.Feature(f.get('match'));
//     return f
//       .set('tmmx_mean_JulAug', match.get('tmmx_mean_JulAug'))
//       .set('year', year);
//   });
// };

// // Verify
// print('TMMX max growing:',
//       getAnnualTMMX(2000).limit(5).aggregate_array('tmmx_max_growing'));
// print('TMMX Jul-Aug mean:',
//       getAnnualTMMX(2000).limit(5).aggregate_array('tmmx_mean_JulAug'));
      
// // ── VPD annual mean + PDSI annual mean ────────────────────────────────────────
// // ── Fix VPD + PDSI — same separate reduction pattern ──────────────────────────
// var getAnnualVPD_PDSI = function(year) {
//   year = ee.Number(year);
  
//   var vpd_img = scaledTerraclimate
//     .filter(ee.Filter.calendarRange(year, year, 'year'))
//     .select('vpd_kPa')
//     .mean()
//     .rename('vpd_ann_mean');
  
//   var pdsi_img = scaledTerraclimate
//     .filter(ee.Filter.calendarRange(year, year, 'year'))
//     .select('pdsi')
//     .mean()
//     .rename('pdsi_ann_mean');

//   var extracted_vpd = vpd_img.reduceRegions({
//     collection: plotCentroids,
//     reducer:    ee.Reducer.mean().setOutputs(['vpd_ann_mean']),
//     scale:      4638,
//     crs:        'EPSG:4326'
//   });

//   var extracted_pdsi = pdsi_img.reduceRegions({
//     collection: plotCentroids,
//     reducer:    ee.Reducer.mean().setOutputs(['pdsi_ann_mean']),
//     scale:      4638,
//     crs:        'EPSG:4326'
//   });

//   var joined = ee.Join.saveFirst('match').apply({
//     primary:   extracted_vpd,
//     secondary: extracted_pdsi,
//     condition: ee.Filter.equals({
//       leftField:  'plot_key',
//       rightField: 'plot_key'
//     })
//   });

//   return joined.map(function(f) {
//     var match = ee.Feature(f.get('match'));
//     return f
//       .set('pdsi_ann_mean', match.get('pdsi_ann_mean'))
//       .set('year', year);
//   });
// };

// // Verify
// print('VPD ann mean:',
//       getAnnualVPD_PDSI(2000).limit(5).aggregate_array('vpd_ann_mean'));
// print('PDSI ann mean:',
//       getAnnualVPD_PDSI(2000).limit(5).aggregate_array('pdsi_ann_mean'));

// // ── TEST SINGLE YEAR ──────────────────────────────────────────────────────────
// // ── TerraClimate extraction verification tests ────────────────────────────────

// // DEF annual sum
// var defTest = getAnnualDef(2000);
// print('DEF test 2000 (first 3 plots):', defTest.limit(3));
// print('Sample def_ann_sum (expect 100-800 mm for CA forests):',
//       defTest.limit(5).aggregate_array('def_ann_sum'));

// // ── Diagnose DEF band naming issue ────────────────────────────────────────────
// var defImg2000 = scaledTerraclimate
//   .filter(ee.Filter.calendarRange(2000, 2000, 'year'))
//   .select('def_mm')
//   .sum();

// print('DEF band names before rename:', defImg2000.bandNames());
// print('DEF band names after rename:', 
//       defImg2000.rename('def_ann_sum').bandNames());

// // Check what reduceRegions actually outputs
// var defTestSingle = defImg2000
//   .rename('def_ann_sum')
//   .reduceRegions({
//     collection: plotCentroids.limit(1),
//     reducer:    ee.Reducer.mean(),
//     scale:      4638,
//     crs:        'EPSG:4326'
//   });
// print('DEF output property names:', 
//       defTestSingle.first().propertyNames());
// // This tells you whether output is 'def_ann_sum' or 'mean'

// // TMMX — both new metrics
// var tmmxTest = getAnnualTMMX(2000);
// print('TMMX max growing season (expect 25-40°C for CA summer):',
//       tmmxTest.limit(5).aggregate_array('tmmx_max_growing'));
// print('TMMX mean Jul-Aug (expect 25-40°C, slightly lower than max):',
//       tmmxTest.limit(5).aggregate_array('tmmx_mean_JulAug'));

// // SWE April max
// var sweTest = getAnnualSWE(2000);
// print('Sample swe_april_max (expect 0-500mm depending on elevation):',
//       sweTest.limit(5).aggregate_array('swe_april_max'));

// // ── Diagnose SWE empty return ──────────────────────────────────────────────────
// // Check if April images exist in TerraClimate for 2000
// var sweCheck = scaledTerraclimate
//   .filter(ee.Filter.calendarRange(2000, 2000, 'year'))
//   .filter(ee.Filter.calendarRange(4, 4, 'month'));

// print('SWE April 2000 collection size:', sweCheck.size());
// print('SWE April band names:', sweCheck.first().bandNames());

// // Check what months are available in 2000
// var months2000 = scaledTerraclimate
//   .filter(ee.Filter.calendarRange(2000, 2000, 'year'))
//   .aggregate_array('system:time_start')
//   .map(function(t) { 
//     return ee.Date(t).format('YYYY-MM'); 
//   });
// print('Available months in 2000:', months2000);

// // VPD and PDSI
// var vpdTest = getAnnualVPD_PDSI(2000);
// print('Sample vpd_ann_mean (expect 0.5-2.0 kPa for CA forests):',
//       vpdTest.limit(5).aggregate_array('vpd_ann_mean'));
// print('Sample pdsi_ann_mean (expect -4 to +4, negative = dry):',
//       vpdTest.limit(5).aggregate_array('pdsi_ann_mean'));

// // ── Cross-check: verify year tag is attached to all outputs ───────────────────
// print('DEF year tag:', defTest.first().get('year'));       // expect 2000
// print('TMMX year tag:', tmmxTest.first().get('year'));     // expect 2000
// print('SWE year tag:', sweTest.first().get('year'));       // expect 2000
// print('VPD year tag:', vpdTest.first().get('year'));       // expect 2000

// // ── Verify plot_key and Correct_Plot_Label_final survived ─────────────────────
// print('plot_key present:', defTest.first().get('plot_key'));
// print('Correct_Plot_Label_final:', 
//       defTest.first().get('Correct_Plot_Label_final'));
// print('Fire_ID:', defTest.first().get('Fire_ID'));

// // ── Spot check a high elevation plot for SWE ──────────────────────────────────
// // High elevation plots should show nonzero SWE — low elevation should be 0
// var highElevSWE = getAnnualSWE(2000)
//   .filter(ee.Filter.gt('lat', 38))   // northern CA higher elevation
//   .limit(5);
// print('High lat SWE sample (expect some nonzero values):',
//       highElevSWE.aggregate_array('swe_april_max'));

// var lowElevSWE = getAnnualSWE(2000)
//   .filter(ee.Filter.lt('lat', 35))   // southern CA lower elevation
//   .limit(5);
// print('Low lat SWE sample (expect near 0):',
//       lowElevSWE.aggregate_array('swe_april_max'));

// // ── Full verification ──────────────────────────────────────────────────────────
// print('DEF ann sum (600-900):',
//       getAnnualDef(2000).limit(5).aggregate_array('def_ann_sum'));
// print('TMMX max growing (25-40°C):',
//       getAnnualTMMX(2000).limit(5).aggregate_array('tmmx_max_growing'));
// print('TMMX Jul-Aug mean (23-38°C):',
//       getAnnualTMMX(2000).limit(5).aggregate_array('tmmx_mean_JulAug'));
// print('SWE April max (0-500mm):',
//       getAnnualSWE(2000).limit(5).aggregate_array('swe_april_max'));
// print('VPD ann mean (0.5-2.0 kPa):',
//       getAnnualVPD_PDSI(2000).limit(5).aggregate_array('vpd_ann_mean'));
// print('PDSI ann mean (-4 to +4):',
//       getAnnualVPD_PDSI(2000).limit(5).aggregate_array('pdsi_ann_mean'));

// Expected ranges:
// def_ann_sum:      600-900 mm (CA dry forests 2000)
// tmmx_max_growing: 25-40°C
// tmmx_mean_JulAug: 23-38°C
// swe_april_max:    0-500mm (elevation dependent)
// vpd_ann_mean:     0.5-2.0 kPa
// pdsi_ann_mean:    -4 to +4

      //-- EXPORT--//
// Export.table.toDrive({ // @22min 05.02.2026
//   collection:  ee.FeatureCollection(tcYears.map(getAnnualDef)).flatten(),
//   description: 'TerraClimate_DEF_175_1990_2024',
//   fileFormat:  'CSV',
//   folder:      'EarthEngine',
//   selectors:   tcSelectors.concat(['def_ann_sum'])
// });

// Export.table.toDrive({ // @17min  05.02.2026
//   collection:  ee.FeatureCollection(tcYears.map(getAnnualSWE)).flatten(),
//   description: 'TerraClimate_SWE_175_1990_2024',
//   fileFormat:  'CSV',
//   folder:      'EarthEngine',
//   selectors:   tcSelectors.concat(['swe_april_max'])
// });

// Export.table.toDrive({ // @1hr 05.02.2026
//   collection:  ee.FeatureCollection(tcYears.map(getAnnualTMMX)).flatten(),
//   description: 'TerraClimate_TMMX_175_1990_2024',
//   fileFormat:  'CSV',
//   folder:      'EarthEngine',
//   selectors:   tcSelectors.concat(['tmmx_max_growing', 'tmmx_mean_JulAug'])
// });
      
// Export.table.toDrive({ // @2hr 05.02.2026
//   collection:  ee.FeatureCollection(tcYears.map(getAnnualVPD_PDSI)).flatten(),
//   description: 'TerraClimate_VPD_PDSI_175_1990_2024',
//   fileFormat:  'CSV',
//   folder:      'EarthEngine',
//   selectors:   tcSelectors.concat(['vpd_ann_mean', 'pdsi_ann_mean'])
// });

// Also broken
// ── 30-YEAR CLIMATE NORMALS (1991-2020) ───────────────────────────────────────

// Annual mean normals — DEF, SWE April, VPD, PDSI unchanged
// var defNormal = scaledTerraclimate
//   .filterDate('1991-01-01', '2020-12-31')
//   .select('def_mm')
//   .mean()
//   .rename('def_normal_ann');

// // April SWE normal — mean of April values across 30 years
// var sweNormal = scaledTerraclimate
//   .filterDate('1991-01-01', '2020-12-31')
//   .filter(ee.Filter.calendarRange(4, 4, 'month'))
//   .select('swe_mm')
//   .mean()
//   .rename('swe_normal_april');

// // VPD annual mean normal
// var vpdNormal = scaledTerraclimate
//   .filterDate('1991-01-01', '2020-12-31')
//   .select('vpd_kPa')
//   .mean()
//   .rename('vpd_normal_ann');

// // PDSI annual mean normal
// var pdsiNormal = scaledTerraclimate
//   .filterDate('1991-01-01', '2020-12-31')
//   .select('pdsi')
//   .mean()
//   .rename('pdsi_normal_ann');

// // TMMX Option A normal: mean of annual growing season max (May-Oct)
// // Matches tmmx_max_growing in annual extraction
// var tmmxMaxGrowingNormal = ee.ImageCollection(
//   ee.List.sequence(1991, 2020).map(function(year) {
//     return scaledTerraclimate
//       .filter(ee.Filter.calendarRange(year, year, 'year'))
//       .filter(ee.Filter.calendarRange(5, 10, 'month'))
//       .select('tmmx_C')
//       .max();                    // max monthly tmmx within growing season
//   })
// ).mean()                         // mean of annual max across 30 years
// .rename('tmmx_normal_max_growing');

// // TMMX Option B normal: mean July-August tmmx across 30 years
// // Matches tmmx_mean_JulAug in annual extraction
// var tmmxJulAugNormal = scaledTerraclimate
//   .filterDate('1991-01-01', '2020-12-31')
//   .filter(ee.Filter.calendarRange(7, 8, 'month'))
//   .select('tmmx_C')
//   .mean()
//   .rename('tmmx_normal_JulAug');

// // ── Combine all normals into single image ─────────────────────────────────────
// var climateNormals = defNormal
//   .addBands(sweNormal)
//   .addBands(vpdNormal)
//   .addBands(pdsiNormal)
//   .addBands(tmmxMaxGrowingNormal)
//   .addBands(tmmxJulAugNormal);

// print('Climate normals band names:', climateNormals.bandNames());
// // Verify normal is in same units as annual extraction before export
// print('Normal JulAug sample:', 
//       tmmxJulAugNormal.reduceRegion({
//         reducer: ee.Reducer.mean(),
//         geometry: plotCentroids.first().geometry().buffer(4638),
//         scale: 4638
//       }));
// // Should return ~27-30°C, matching tmmx_mean_JulAug in annual data

// // Expect: def_normal_ann, swe_normal_april, vpd_normal_ann, 
// //         pdsi_normal_ann, tmmx_normal_max_growing, tmmx_normal_JulAug

// // ── Sample at centroids ────────────────────────────────────────────────────────
// var normalsPerPlot = climateNormals.reduceRegions({
//   collection: plotCentroids,
//   reducer:    ee.Reducer.mean(),
//   scale:      4638,              // TerraClimate native resolution
//   crs:        'EPSG:4326'
// });

// // ── Verify ────────────────────────────────────────────────────────────────────
// print('Normals test (first 2):', normalsPerPlot.limit(2));
// print('def_normal_ann (expect 400-700 mm for 30yr mean):',
//       normalsPerPlot.limit(5).aggregate_array('def_normal_ann'));
// print('swe_normal_april (expect 0-300mm elevation dependent):',
//       normalsPerPlot.limit(5).aggregate_array('swe_normal_april'));
// print('tmmx_normal_max_growing (expect 28-38°C):',
//       normalsPerPlot.limit(5).aggregate_array('tmmx_normal_max_growing'));
// print('tmmx_normal_JulAug (expect 25-36°C):',
//       normalsPerPlot.limit(5).aggregate_array('tmmx_normal_JulAug'));
// print('vpd_normal_ann (expect 0.5-1.5 kPa):',
//       normalsPerPlot.limit(5).aggregate_array('vpd_normal_ann'));
// print('pdsi_normal_ann (expect near 0 for 30yr mean):',
//       normalsPerPlot.limit(5).aggregate_array('pdsi_normal_ann'));
      
// ── Export ────────────────────────────────────────────────────────────────────
// Export.table.toDrive({ // @<1min 05.02.2026
//   collection:  normalsPerPlot,
//   description: 'TerraClimate_Normals_1991_2020',
//   fileFormat:  'CSV',
//   folder:      'EarthEngine',
//   selectors:   [
//     'Fire_ID', 'Fire_Name', 'Category', 'Ig_Year',
//     'long', 'lat', 'plot_key', 'Correct_Plot_Label_final',
//     'def_normal_ann',
//     'swe_normal_april',
//     'vpd_normal_ann',
//     'pdsi_normal_ann',
//     'tmmx_normal_max_growing',
//     'tmmx_normal_JulAug'
//   ]
// });

// ** Note: Note the normals are mean monthly values over 30 years — so def_normal represents average monthly deficit, not annual. 
// In R after import you'd multiply by 12 to get annual normal deficit if needed for comparison with your annual totals.

// ── RAP RANGELAND (buffered weighted mean) ────────────────────────────────────
// RAP: Rangeland Analysis Platform annual cover components: https://gee-community-catalog.org/projects/rap/

// Citations:
// Allred, B. W., McCord, S. E., Assal, T. J., Bestelmeyer, B. T., Boyd, C. S., Brooks, A. C., Cady, S. M., Fuhlendorf, S. D., Green, S. A., Harrison, G. R., Jensen, E. R., Kachergis, E. J., Mattilio, C. M., Mealor, B. A., Naugle, D. E., O’Leary, D., Olsoy, P. J., Peirce, E. S., Reinhardt, J. R., Shriver, R. K., Smith, J. T., Tack, J. D., Tanner, A. M., Tanner, E. P., Twidwell, D., Webb, N. P., & Morford, S. L. (2025). Estimating rangeland fractional cover and canopy gap size class with Sentinel-2 imagery. bioRxiv. https://doi.org/10.1101/2025.03.13.643073 
// Jones, M. O., Robinson, N. P., Naugle, D. E., Maestas, J. D., Reeves, M. C., Lankston, R. W., & Allred, B. W. (2021). Annual and 16-day rangeland production estimates for the western United States. Rangeland Ecology & Management, 77, 112-117.
// Robinson, N. P., M. O. Jones, A. Moreno, T. A. Erickson, D. E. Naugle, and B. W.
// Allred. 2019. Rangeland productivity partitioned to sub-pixel plant functional
// types. Remote Sensing 11:1427. http://dx.doi.org/10.3390/rs11121427
// Allred, B. W., Bestelmeyer, B. T., Boyd, C. S., Brown, C., Davies, K. W., Duniway, M. C., Ellsworth, L. M., Erickson, T. A., Fuhlendorf, S. D., Griffiths, T. V., Jansen, V., Jones, M. O., Karl, J., Knight, A., Maestas, J. D., Maynard, J. J., McCord, S. E., Naugle, D. E., Starns, H. D., Twidwell, D., & Uden, D. R. (2021). Improving Landsat predictions of rangeland fractional cover with multitask learning and uncertainty. Methods in Ecology and Evolution, 12(5), 841–849. https://doi.org/10.1111/2041-210X.13564


// 30m resolution - use 56m plotBuffers (not centroids)
var RAP = ee.ImageCollection('projects/rap-data-365417/assets/vegetation-cover-v3') //Google Earth Engine ImageCollection: ‘projects/rap-data-365417/assets/vegetation-cover-v3’ 
  .filterDate('1990-01-01', '2025-12-31')
  .filterBounds(CA);

print('RAP collection size:', RAP.size());
print('RAP first image bands:', RAP.first().bandNames());

//Your RAP bands decoded:
// AFG = Annual Forbs and Grasses (%); AFG and PFG capture understory recovery and grass/forb encroachment post-fire
// BGR = Bare Ground (%)
// LTR = Litter (%)
// PFG = Perennial Forbs and Grasses (%)
// SHR = Shrubs (%)
// TRE = Trees (%) TRE directly tracks tree canopy recovery post-fire

// Check RAP year range
print('RAP years:', RAP.aggregate_array('system:index'));
print('RAP size:', RAP.size());  // 36 images = 1990-2025

// Test RAP wtd mean extraction on buffered plots (30m = use plotBuffers not centroids)
var rapTest = RAP.first().select(['AFG', 'BGR', 'LTR', 'PFG', 'SHR', 'TRE'])
  .reduceRegions({
    collection: plotBuffers.limit(10),
    reducer: ee.Reducer.mean(),
    scale: 30,
    tileScale: 4
  });

print('RAP test:', rapTest.limit(2));
print('RAP year range:', RAP.aggregate_array('system:index'));
print('Sample TRE:', rapTest.aggregate_array('TRE'));
print('Sample AFG:', rapTest.aggregate_array('AFG'));

var rapYears = ee.List.sequence(1990, 2025);

var getAnnualRAP = function(year) {
  year = ee.Number(year);
  
  var rapImage = RAP
    .filter(ee.Filter.calendarRange(year, year, 'year'))
    .first()
    .select(['AFG', 'BGR', 'LTR', 'PFG', 'SHR', 'TRE']);

  return rapImage.reduceRegions({
    collection: plotBuffers,
    reducer: ee.Reducer.mean(),
    scale: 30,
    tileScale: 4
  }).map(function(f) {
    return f.set('year', year);
  });
};

// Test single year first
var rapTest2000 = getAnnualRAP(2000);
print('RAP 2000 test:', rapTest2000.limit(2));
print('Sample TRE 2000:', rapTest2000.limit(5).aggregate_array('TRE'));

// Export.table.toDrive({ // Export @25min 05.02.26
//   collection: ee.FeatureCollection(rapYears.map(getAnnualRAP)).flatten(),
//   description: 'RAP_Cover_175_1990_2025',
//   fileFormat: 'CSV',
//   folder: 'EarthEngine',
//   selectors: ['Fire_ID', 'Fire_Name', 'Category', 'Ig_Year',
//               'long', 'lat', 'plot_key', 'year',
//               'AFG', 'BGR', 'LTR', 'PFG', 'SHR', 'TRE',
//               'Correct_Plot_Label_final']
// });

// ── NAIP VALIDATION SUBSET ────────────────────────────────────────────────────
//Beginning in 2003, NAIP was acquired on a 5-year cycle. 2008 was a transition year, and a three-year cycle began in 2009

// Stratify by fire: 5 Burned_clean plots per fire = 895 validation plots
// 10 plots per fire n= 1075 validation plots to check for temporal RAP match

//ee.Filter.eq for 2 categories like below:
var fireIDs = plotBuffers
  .filter(ee.Filter.eq('Correct_Plot_Label_final', 'Burned_clean'))
  .aggregate_array('Fire_ID')
  .distinct();

var validationByFire = ee.FeatureCollection(
  fireIDs.map(function(fid) {
    return plotBuffers
      .filter(ee.Filter.eq('Fire_ID', fid))
      .filter(ee.Filter.eq('Correct_Plot_Label_final', 'Burned_clean'))
      .limit(10); // amount of burned and burned_clean_flagged plots sampled per fire
  })
).flatten();

print('Validation plots by fire:', validationByFire.size());
Map.addLayer(validationByFire, {color: 'red'}, 'Validation plots');

// ── NAIP: 4-band only (NIR required for NDVI) ─────────────────────────────────
var NAIP = ee.ImageCollection('USDA/NAIP/DOQQ')
  .filterBounds(CA)
  .filter(ee.Filter.listContains('system:band_names', 'N'));

var naipWithNDVI = NAIP.map(function(img) {
  return img.normalizedDifference(['N', 'R'])
    .rename('NDVI')
    .set('year', ee.Number.parse(img.date().format('YYYY')))
    .set('system:time_start', img.get('system:time_start'));
});

print('4-band NAIP size:', NAIP.size());

// ── EXTRACT PRE- AND POST-FIRE NAIP NDVI ─────────────────────────────────────
//**1. — Quantitative: NAIP NDVI delta** (pair with manual observation below)
//Compare pre-fire vs post-fire NAIP NDVI extracted from your plot polygons. This gives you a numeric signal of canopy change at 1m resolution that you can correlate with your RAP TRE timeseries. This is what the current extraction code produces. It answers: *"does RAP TRE decline match what NAIP sees?"*
// ── Fixed extractNAIP function ─────────────────────────────────────────────────
var extractNAIP = function(feature) {
  
  // Fix 1: construct igDate correctly from Ig_Year integer
  var igYear  = ee.Number(feature.get('Ig_Year')).int();
  var igDate  = ee.Date.fromYMD(igYear, 1, 1);        // January 1 of fire year
  var igDateEnd = ee.Date.fromYMD(igYear, 12, 31);    // December 31 of fire year
  var geom    = feature.geometry();

  // Growing season only (June-October)
  var naipGrowing = naipWithNDVI
    .filterBounds(geom)
    .filter(ee.Filter.calendarRange(6, 10, 'month'));

  // Pre-fire: most recent growing season NAIP before fire year
  // Use start of fire year as cutoff — not igDate which was wrong
  var preFire = naipGrowing
    .filter(ee.Filter.date('2003-01-01', igDate))
    .sort('system:time_start', false)
    .first();

  // Post-fire: first growing season NAIP after fire year ends
  var postFire = naipGrowing
    .filter(ee.Filter.date(
      igDateEnd,
      igDate.advance(5, 'year')
    ))
    .sort('system:time_start', true)
    .first();

  // Safe reduce — handles null image case
  var safeReduce = function(img) {
    return ee.Dictionary(ee.Algorithms.If(
      img,
      ee.Image(img).reduceRegion({
        reducer:   ee.Reducer.mean(),
        geometry:  geom,
        scale:     1,
        tileScale: 4,
        maxPixels: 1e8
      }),
      ee.Dictionary({'NDVI': null})
    ));
  };

  var preDict  = safeReduce(preFire);
  var postDict = safeReduce(postFire);

  // Fix 2: get year safely — returns -9999 if no image found
  var getYear = function(img) {
    return ee.Algorithms.If(
      img,
      ee.Image(img).get('year'),
      -9999
    );
  };

  return feature
    .set('NAIP_NDVI_preFire',  preDict.get('NDVI'))
    .set('NAIP_NDVI_postFire', postDict.get('NDVI'))
    .set('NAIP_year_pre',      getYear(preFire))
    .set('NAIP_year_post',     getYear(postFire));
};

// ── Verify fix on known good fire (2012-2014) ─────────────────────────────────
var lateTestPlots = plotBuffers
  .filter(ee.Filter.eq('Correct_Plot_Label_final', 'Burned_clean'))
  .filter(ee.Filter.gte('Ig_Year', 2012))
  .limit(3);

var naipLateTest = lateTestPlots.map(extractNAIP);

print('NAIP late fire test:', naipLateTest.select([
  'Fire_ID', 'plot_key', 'Ig_Year',
  'NAIP_NDVI_preFire', 'NAIP_year_pre',
  'NAIP_NDVI_postFire', 'NAIP_year_post'
]));
// Expect: NDVI values ~0.4-0.7 pre, ~0.1-0.4 post
// Expect: pre year < Ig_Year, post year > Ig_Year

// ── Also verify a pre-2007 fire returns -9999 as expected ─────────────────────
var earlyTestPlots = plotBuffers
  .filter(ee.Filter.eq('Correct_Plot_Label_final', 'Burned_clean'))
  .filter(ee.Filter.lte('Ig_Year', 2005))
  .limit(3);

var naipEarlyTest = earlyTestPlots.map(extractNAIP);

print('NAIP early fire test (expect -9999 for post):', naipEarlyTest.select([
  'Fire_ID', 'Ig_Year',
  'NAIP_NDVI_preFire', 'NAIP_year_pre',
  'NAIP_NDVI_postFire', 'NAIP_year_post'
]));


// ── Once verified, rebuild full validation set and export ──────────────────────

var validationFull = ee.FeatureCollection(
  plotBuffers
    .aggregate_array('Fire_ID')
    .distinct()
    .map(function(fid) {
      return plotBuffers // to get spatially random plot extraction
      .filter(ee.Filter.eq('Fire_ID', fid))
      .filter(ee.Filter.eq('Correct_Plot_Label_final', 'Burned_clean'))
      .randomColumn('rand_val')
      .sort('rand_val')
      .limit(10);
    })
).flatten();

print('Full validation set size:', validationFull.size()); // expect ~1075 plots 10x 175 fires
// ── Verify validation set before export ───────────────────────────────────────
print('Total validation plots:', validationFull.size()); 
// Expect ~1,750 (175 fires × 10, less for fires with < 10 burned clean plots)

// Check plots per fire — confirm no fire has > 10
var plotsPerFire = validationFull
  .reduceColumns(ee.Reducer.frequencyHistogram(), ['Fire_ID'])
  .get('histogram');
print('Plots per fire distribution:', plotsPerFire);

// Spot check that rand_val produced different plots than index order
// by checking coordinates vary across first 10 plots of one fire
var sampleFire = validationFull
  .filter(ee.Filter.eq('Fire_ID', 
    validationFull.first().get('Fire_ID')))
  .aggregate_array('plot_key');
print('Sample fire plot_keys (should show 10 different plots):', sampleFire);


var naipValidationFull = validationFull.map(extractNAIP);

Export.table.toDrive({ // @ 23 min 05.02.2026
  collection:  naipValidationFull,
  description: 'NAIP_Validation_175_Burned_Clean_fixed',
  fileFormat:  'CSV',
  folder:      'EarthEngine',
  selectors:   [
    'Fire_ID', 'Fire_Name', 'plot_key', 'Ig_Year',
    'long', 'lat', 'Correct_Plot_Label_final',
    'NAIP_NDVI_preFire', 'NAIP_year_pre',
    'NAIP_NDVI_postFire', 'NAIP_year_post'
  ]
});
STOP

var extractNAIP = function(feature) {
  var igYear = ee.Number.parse(feature.get('focal_year'));
  var igDate = ee.Date(feature.get('Ig_Year'));
  var geom = feature.geometry();

  // Growing season only (June-October) to avoid dormancy artifacts
  var naipGrowing = naipWithNDVI
    .filterBounds(geom)
    .filter(ee.Filter.calendarRange(6, 10, 'month'));

  // Pre-fire: most recent growing season NAIP before ignition date
  var preFire = naipGrowing
    .filter(ee.Filter.date('2003-01-01', igDate))
    .sort('system:time_start', false)
    .first();

  // Post-fire: first growing season NAIP strictly AFTER ignition date
  var postFire = naipGrowing
    .filter(ee.Filter.date(igDate, igDate.advance(5, 'year')))
    .sort('system:time_start', true)
    .first();

  var safeReduce = function(img) {
    return ee.Dictionary(ee.Algorithms.If(
      img,
      ee.Image(img).reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geom,
        scale: 1,
        tileScale: 4
      }),
      ee.Dictionary({'NDVI': null})
    ));
  };

  var preDict  = safeReduce(preFire);
  var postDict = safeReduce(postFire);

  return feature
    .set('NAIP_NDVI_preFire',  preDict.get('NDVI'))
    .set('NAIP_NDVI_postFire', postDict.get('NDVI'))
    .set('NAIP_year_pre',  ee.Algorithms.If(preFire,
                           ee.Image(preFire).get('year'), -9999))
    .set('NAIP_year_post', ee.Algorithms.If(postFire,
                           ee.Image(postFire).get('year'), -9999));
};

// Test on 5 plots in Storrie (these should return as 9999 as Storrie occurred before NAIP)
var naipTest = validationByFire.limit(5).map(extractNAIP);
print('NAIP test:', naipTest.select([
  'Fire_ID', 'plot_key', 'focal_year',
  'NAIP_NDVI_preFire', 'NAIP_year_pre',
  'NAIP_NDVI_postFire', 'NAIP_year_post'
]));

// Test on a 2012-2014 fire where pre AND post NAIP should exist
// focal_year is stored as string — cast to integer for comparison
var lateTestPlots = plotBuffers
  .map(function(f) {
    return f.set('focal_year_int', ee.Number.parse(f.get('focal_year')));
  })
  .filter(ee.Filter.eq('Correct_Plot_Label_final', 'Burned_clean'))
  .filter(ee.Filter.gte('focal_year_int', 2012))
  .limit(3);

var naipLateTest = lateTestPlots.map(extractNAIP);
print('NAIP late fire test v2:', naipLateTest.select([
  'Fire_ID', 'plot_key', 'focal_year', 'Ig_Year',
  'NAIP_NDVI_preFire', 'NAIP_year_pre',
  'NAIP_NDVI_postFire', 'NAIP_year_post'
]));


// Check NAIP tiles exist over first plot
var testGeom = lateTestPlots.first().geometry();
var localNAIP = NAIP.filterBounds(testGeom);
print('NAIP years over test plot:', localNAIP.aggregate_array('year'));
//Map.centerObject(testGeom, 15);
Map.addLayer(localNAIP.mosaic(), {bands:['R','G','B'], min:0, max:255}, 'NAIP check');
Map.addLayer(lateTestPlots, {color:'red'}, 'Late test plots');

// These values look exactly right — this is your delayed mortality signal working:
// Pre-fire NDVI 0.614 — healthy forested canopy, June-Oct 2012 before August 5 fire ✓
// Post-fire NDVI 0.109 — dramatic canopy loss by 2014 ✓
// Pre-fire year 2012, post-fire year 2014 — correctly straddling the ignition date ✓

// A drop of ~0.50 NDVI units is a strong immediate mortality signal for this plot. Submit the full validation export:

// ── EXPORT NAIP VALIDATION FOR ALL ~895, 1,750 PLOTS ─────────────────────────────────
var allValidationPlots = plotBuffers
  .map(function(f) {
    return f.set('focal_year_int', ee.Number.parse(f.get('focal_year')));
  })
  .filter(ee.Filter.eq('Correct_Plot_Label_final', 'Burned_clean'));

// 5 plots per fire
var validationFull = ee.FeatureCollection(
  plotBuffers
    .aggregate_array('Fire_ID')
    .distinct()
    .map(function(fid) {
      return plotBuffers
        .filter(ee.Filter.eq('Fire_ID', fid))
        .filter(ee.Filter.eq('Correct_Plot_Label_final', 'Burned_clean'))
        .limit(5);
    })
).flatten();

//print('Full validation set size:', validationFull.size());

var naipValidationFull = validationFull.map(extractNAIP);

Export.table.toDrive({ // Export @ 41min 05.02.26
  collection: naipValidationFull,
  description: 'NAIP_Validation_175_Burned_Clean',
  fileFormat: 'CSV',
  folder: 'EarthEngine',
  selectors: ['Fire_ID', 'Fire_Name', 'plot_key', 'focal_year', 'Ig_Year',
              'long', 'lat', 'Correct_Plot_Label_final',
              'NAIP_NDVI_preFire', 'NAIP_year_pre',
              'NAIP_NDVI_postFire', 'NAIP_year_post']
});

STOP
//-------- Manual Observation to Identify/Validate tree mortality --------------------//

// **2 — Visual: Manual interpretation**
// Like Google Earth Pro — you visually inspect pre/post NAIP imagery for a subset of plots and manually classify each as:
// - Live canopy intact
// - Immediate mortality (dead canopy by first post-fire NAIP)
// - Delayed mortality (live at first post-fire NAIP, dead at later NAIP)
// - Recovery/regrowth

// This is the gold standard for validating your delayed mortality hypothesis specifically, because NDVI alone can't distinguish a dead standing snag (still blocking light, some spectral signal) from a live tree.

// **My recommendation — use both, sequentially:**
// ```
// Step 1: Export NAIP NDVI delta for all 895 validation plots (quantitative)
//         → Correlate with RAP TRE to confirm products agree

// Step 2: Manually classify ~100 plots visually in GEE or Google Earth Pro
//         → Stratified: ~25 immediate mortality, ~25 delayed, ~25 recovery, ~25 unburned
//         → This becomes your "ground truth" for model validation

// Step 3: Compare manual classifications against RAP TRE trajectory
//         → Do delayed mortality plots show gradual TRE decline years post-fire?
//         → This directly validates your core hypothesis

// Visual validation app — click plots, view NAIP time series (run the lat and long of plots into Google Earth Pro)

STOP

// To-Do: 

// In R after import you'd multiply Climate Normals by 12 to get annual normal deficit if needed for comparison with your annual totals.

//Hansen lossyear also gives you a hard detection year for canopy loss 
//compare against the RAP TRE trajectory — plots where RAP TRE declines gradually years after fire but Hansen lossyear fires late would be your delayed mortality signal.

// Google Earth Pro Manual Visual Check of Plot Subset



