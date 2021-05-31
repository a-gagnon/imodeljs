/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

export class DriveToolConfig {

  public static intervalTime = 0.5;

  public static heightMin = 0.1;
  public static heightMax = 20;
  public static heightStep = 0.1;
  public static heightDefault = 1.5;

  public static lateralOffsetMin = -5;
  public static lateralOffsetMax = 5;
  public static lateralOffsetStep = 0.1;
  public static lateralOffsetDefault = 0;

  public static speedMin = -50;
  public static speedMax = 50;
  public static speedStep = 1;
  public static speedDefault = 100 / 3.6;

  public static fovMin = 5;
  public static fovMax = 175;
  public static fovStep = 5;
  public static fovDefault = 75;

  public static detectionRectangleWidth = 100;
  public static detectionRectangleHeight = 100;

  public static targetDistanceDefault = 200;
  public static targetHeight = 3;
}
